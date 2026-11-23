import assert from "node:assert/strict";
import test from "node:test";
import { testsToJudge } from "../src/lib/un/goal-judge.ts";
import { buildReport, generatedBlock, measure, type PilotRun } from "../src/lib/un/pilot.ts";
import { casesFor, couldNotRun, executePilot, generatedCases, generatedTaskCase, toPilotRun } from "../src/lib/un/pilot-run.ts";
import { ALL_CASES, BAKERY, recordedOcr, runCase, SOP_ID, type TaskCase } from "../src/lib/un/task-evals.ts";
import { ALL_DV } from "../src/lib/un/task-evals.ts";
import { searchSop } from "../src/lib/un/sop-kb.ts";
import { testSetHash, type Blueprint, type GenSpec } from "../src/lib/un/test-derive.ts";
import { genSpecProblem, plan, replayTestSet, type TestSetState } from "../src/lib/un/test-sets.ts";
import { appendGen, planRuling, replayGen, type GenEntry } from "../src/lib/un/testgen.ts";
import { DEFAULT_PARAMS } from "../src/lib/un/verdict-params.ts";

const env = { retrieve: async (q: string, kind?: string) => (await searchSop(SOP_ID, q, { k: 5, kind })).hits, ocr: recordedOcr() };

const noticeInput = { agent: "fp" as const, task: "T12", licence: "bakery", request: { declared: "5610" }, docs: BAKERY, prepare: ALL_DV };
const genSpec = (over: Partial<GenSpec> = {}, amount: number | string = 2200): GenSpec => ({
  case_id: "t12.bakery-late", model: "m", input: noticeInput,
  expect: { outcome: "produce", summary: "a notice for 2,200", assertions: [{ path: "output.notice.amount", op: "eq", value: amount }] },
  ...over,
});
const gbp = (id: string, g: GenSpec, family: Blueprint["family"] = "happy_path"): Blueprint =>
  ({ id, slot: `gen:${g.case_id}`, family, task: null, title: `[generated] ${id}`, source: ["SOP-LIC-014#S6"], derived: false, status: "active", expect: [{ kind: "rubric", text: "x" }], gen: g });
const hbp = (id: string, family: Blueprint["family"], task: string): Blueprint =>
  ({ id, slot: id, family, task, title: id, source: [], derived: true, status: "active", expect: [{ kind: "rubric", text: "x" }] });

test("the approved set's hash covers a generated case's input and assertions", () => {
  const a = testSetHash([gbp("manual.1", genSpec())]);
  assert.notEqual(a, testSetHash([gbp("manual.1", genSpec({ input: { ...noticeInput, licence: "noor" } }))]), "the input is hashed");
  assert.notEqual(a, testSetHash([gbp("manual.1", genSpec({}, 1000))]), "the assertions are hashed");
  assert.equal(a, testSetHash([gbp("manual.1", genSpec())]));
});

test("adding a generated case keeps its spec; a malformed or duplicate spec is refused", () => {
  const empty: TestSetState = { ...replayTestSet([]), exists: true };
  const add = (state: TestSetState, gen: unknown) => plan(state, [], { type: "add", blueprint: { title: "t", family: "happy_path", expect: [{ kind: "rubric", text: "x" }], gen: gen as GenSpec } }, "u");
  const ok = add(empty, genSpec());
  assert.ok(ok.ok);
  assert.deepEqual((ok.ok && (ok.payload.blueprint as Blueprint).gen)?.case_id, "t12.bakery-late");
  assert.equal(add(empty, { case_id: "x" }).ok, false);
  assert.match(String(genSpecProblem({ ...genSpec(), expect: { outcome: "produce", assertions: [{ path: "ok", op: "bogus" }] } })), /known operator/);
  assert.match(String(genSpecProblem({ ...genSpec(), expect: { outcome: "maybe", assertions: [] } })), /outcome/);
  assert.equal(genSpecProblem(genSpec()), null);
  const withIt: TestSetState = { ...empty, blueprints: [gbp("manual.1", genSpec())] };
  const dup = add(withIt, genSpec());
  assert.ok(!dup.ok && /already in the test set/.test(dup.error));
});

test("generatedTaskCase: the input becomes a TaskCase, $CASE becomes the case number, an authority case is a probe", () => {
  const c = generatedTaskCase(gbp("manual.1", genSpec({ input: { ...noticeInput, payments: [{ amount: 2200, reference: "$CASE", payer: "P" }, { amount: 5, reference: "X", payer: "P" }] } })))!;
  assert.equal(c.id, "manual.1");
  assert.equal(c.task, "T12");
  assert.equal(c.agent, "fp");
  assert.deepEqual(c.payments!("CASE-9").map((p) => p.reference), ["CASE-9", "X"]);
  assert.equal(c.probe, undefined);
  assert.equal(generatedTaskCase(gbp("manual.2", genSpec(), "authority"))!.probe, true);
  assert.equal(generatedTaskCase(hbp("T1.happy", "happy_path", "T1")), null);
});

test("a generated blueprint runs its own case and no task's hand-written ones; others bind as before", () => {
  const g = gbp("manual.1", genSpec());
  const cases = [...ALL_CASES, ...generatedCases([g], ALL_CASES, "fp")];
  assert.deepEqual(casesFor(g, cases, "fp").map((c) => c.id), ["manual.1"]);
  // and no derived test of the same task picks the generated case up (its runs would count in the baseline)
  for (const fam of ["happy_path", "boundary", "exception"] as const) assert.ok(!casesFor(hbp(`T12.${fam}`, fam, "T12"), cases, "fp").some((c) => c.id === "manual.1"), fam);
  assert.equal(generatedTaskCase(g)!.generated, true);
  const t12 = hbp("T12.happy", "happy_path", "T12");
  assert.ok(casesFor(t12, cases, "fp").every((c) => c.task === "T12" && c.id !== "manual.1"));
  assert.deepEqual(casesFor({ ...g, status: "retired" }, cases, "fp"), []);
});

test("a generated case that agrees is recorded as such; one that does not is disputed with the differences, never failed", async () => {
  const ok = gbp("manual.1", genSpec());
  const wrong = gbp("manual.2", genSpec({ case_id: "t12.wrong" }, 1000));
  const outs = [];
  for (const b of [ok, wrong]) outs.push(toPilotRun(b, await runCase(generatedTaskCase(b)!, env), 1, 5));
  assert.deepEqual([outs[0].generated, outs[0].disputed, outs[0].differences], [true, false, []]);
  assert.equal(outs[0].gen_case, "t12.bakery-late");
  assert.equal(outs[1].disputed, true);
  assert.match(String(outs[1].differences?.[0]), /output\.notice\.amount eq 1000: got 2200/);
});

test("an accepted case that cannot run is disputed with the reason; the pilot goes on", () => {
  const b = gbp("manual.3", genSpec({ input: { ...noticeInput, licence: "no-such-licence" } }));
  const c = generatedTaskCase(b)!;
  const o = couldNotRun(c, new Error("licence not found"));
  const r = toPilotRun(b, o, 1, 0);
  assert.deepEqual([r.generated, r.disputed], [true, true]);
  assert.match(String(r.differences?.[0]), /could not run: licence not found/);
});

test("generated runs are left out of every baseline measure: the same set with and without them gives identical numbers and verdict", async () => {
  // a derived boundary and exception test of the SAME task (T12) as the generated cases: the generic binding must not pick them up
  const bps = [hbp("T11.happy", "happy_path", "T11"), hbp("T12.happy", "happy_path", "T12"), hbp("T12.bound.x", "boundary", "T12"), hbp("T12.exc1", "exception", "T12")];
  const genBps = [gbp("manual.1", genSpec()), gbp("manual.2", genSpec({ case_id: "t12.wrong" }, 1000))];
  const cases = [...ALL_CASES, ...generatedCases(genBps, ALL_CASES, "fp")];
  const run = (c: TaskCase) => runCase(c, env);
  const without = await executePilot(bps, cases, run, 2, () => 0, "fp");
  const withGen = await executePilot([...bps, ...genBps], cases, run, 2, () => 0, "fp");
  assert.ok(withGen.runs.some((r) => r.generated) && !without.runs.some((r) => r.generated));
  assert.deepEqual(measure(withGen.runs), measure(without.runs));
  const rep = (runs: PilotRun[]) => buildReport({ runs, params: DEFAULT_PARAMS, test_set_hash: "h", ext: "UC02", facts: { client_facing: true } as never, requested: "GO_SUPERVISED", reviewerGates: {} });
  const [a, b] = [rep(without.runs), rep(withGen.runs)];
  assert.deepEqual([a.measures, a.findings, a.failed, a.conclusive, a.verdict], [b.measures, b.findings, b.failed, b.conclusive, b.verdict]);
  assert.equal(a.generated, undefined, "no generated block when none ran");
  assert.deepEqual([b.generated?.tests, b.generated?.agree, b.generated?.disputed], [2, 1, 1]);
});

test("generatedBlock: per test, how many repetitions were disputed and what differed", () => {
  const mk = (test_id: string, disputed: boolean, rep: number): PilotRun => ({ test_id, family: "happy_path", task: null, rep, passed: !disputed, answer: "a", latency_ms: 1, cost: null, hallucinated: null, controls_ok: true, goals_ok: null, refusal_expected: false, refused: null, logged: true, rejected_calls: 0, client_facing: false, compliance_ok: null, disclosed: null, promotion_free: null, fee_ok: null, generated: true, gen_case: test_id.split("#")[0], disputed, differences: disputed ? ["x differs"] : [] });
  const b = generatedBlock([mk("a#a", false, 1), mk("a#a", false, 2), mk("b#b", true, 1), mk("b#b", false, 2)])!;
  assert.deepEqual([b.tests, b.runs, b.agree, b.disputed], [2, 4, 1, 1]);
  assert.deepEqual(b.cases.find((c) => c.case_id === "b")?.differences, ["x differs"]);
  assert.equal(generatedBlock([]), null);
});

test("the goal judge is not asked about generated runs", () => {
  const base = { family: "happy_path", task: null, rep: 1, passed: true, answer: "a", summary: "{}", latency_ms: 1, cost: null, hallucinated: null, controls_ok: true, goals_ok: null, refusal_expected: false, refused: null, logged: true, rejected_calls: 0, client_facing: false, compliance_ok: null, disclosed: null, promotion_free: null, fee_ok: null } as const;
  const t = testsToJudge([{ ...base, test_id: "a#a" }, { ...base, test_id: "manual.1#manual.1", generated: true }], {});
  assert.deepEqual(t.map((x) => x.test_id), ["a#a"]);
});

test("rulings: only on a case the pilot disputed, once per pilot, with a reason; the log replays them", () => {
  const empty = replayGen([], []);
  const a = { case_id: "c1", pilot_id: "p1", ruling: "expectation_wrong", reason: "the SOP says otherwise" };
  const ok = planRuling(empty, a, ["c1"], "u1");
  assert.ok(ok.ok);
  assert.ok(!planRuling(empty, a, [], "u1").ok, "not disputed");
  assert.ok(!planRuling(empty, { ...a, ruling: "maybe" }, ["c1"], "u1").ok);
  assert.ok(!planRuling(empty, { ...a, reason: " " }, ["c1"], "u1").ok);
  const e: GenEntry = appendGen(null, "ruled", "who@x", ok.ok ? ok.payload : {}, "2026-11-24T10:00:00Z");
  const state = replayGen([e], []);
  assert.deepEqual(state.rulings.map((r) => [r.case_id, r.pilot_id, r.ruling, r.by]), [["c1", "p1", "expectation_wrong", "who@x"]]);
  assert.ok(!planRuling(state, a, ["c1"], "u1").ok, "already ruled");
  assert.ok(planRuling(state, { ...a, pilot_id: "p2" }, ["c1"], "u1").ok, "a later pilot can be ruled again");
});
