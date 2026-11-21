import assert from "node:assert/strict";
import test from "node:test";
import { executePilot, planPilot, toPilotRun } from "../src/lib/un/pilot-run.ts";
import type { Blueprint } from "../src/lib/un/test-derive.ts";
import type { CaseOutcome, TaskCase } from "../src/lib/un/task-evals.ts";

const bp = (id: string, family: Blueprint["family"], task: string | null, status: Blueprint["status"] = "active"): Blueprint =>
  ({ id, slot: id, family, task, title: id, source: [], derived: true, status, expect: [{ kind: "rubric", text: "x" }] });
const tc = (id: string, task: string, split: "tune" | "holdout", probe = false): TaskCase =>
  ({ id, task, title: id, split, licence: "noor" as never, probe, check: () => [] });
const outcome = (c: TaskCase, o: Partial<CaseOutcome> = {}): CaseOutcome => ({
  id: c.id, task: c.task, title: c.title, split: c.split, verdict: "correct", failures: [], calls: [{ call: {} as never, decision: "allow" }],
  result: { task: c.task, ok: true, output: { a: 1 }, citations: ["c1"] }, probe: !!c.probe, agent: "dv", ...o,
});

const CASES = [tc("a", "T04", "tune"), tc("b", "T04", "holdout"), tc("auth-1", "T11", "holdout", true)];
const BPS = [bp("T04.happy", "happy_path", "T04"), bp("T04.bound", "boundary", "T04"), bp("T11.auth", "authority", "T11"), bp("T05.happy", "happy_path", "T05"), bp("cf.1", "client_facing", "T10"), bp("gone", "happy_path", "T04", "retired")];

test("plan: tests bind to cases of their task and kind; the rest are listed, never invented", () => {
  const p = planPilot(BPS, CASES);
  assert.deepEqual(p.bound, { "T04.happy": ["a"], "T04.bound": ["b"], "T11.auth": ["auth-1"] });
  assert.deepEqual(p.unexecuted.map((u) => u.id).sort(), ["T05.happy", "cf.1"]);
  assert.match(p.unexecuted.find((u) => u.id === "cf.1")!.why, /client-facing/);
});

test("execute: every bound case runs once per repetition, with latency taken from the clock", async () => {
  let t = 0;
  const seen: string[] = [];
  const { runs } = await executePilot(BPS, CASES, async (c) => { seen.push(c.id); t += 5; return outcome(c); }, 3, () => (t += 10));
  assert.equal(runs.length, 9);
  assert.equal(seen.length, 9);
  assert.ok(runs.every((r) => r.latency_ms !== null && r.latency_ms > 0));
  assert.deepEqual([...new Set(runs.map((r) => r.test_id))].sort(), ["T04.bound#b", "T04.happy#a", "T11.auth#auth-1"]);
});

test("run record: failures, uncited answers and refusals are carried, goals and cost are not invented", () => {
  const c = CASES[0];
  const ok = toPilotRun(BPS[0], outcome(c), 1, 12);
  assert.equal(ok.passed, true); assert.equal(ok.hallucinated, false); assert.equal(ok.goals_ok, null); assert.equal(ok.cost, null); assert.equal(ok.logged, true);
  const bad = toPilotRun(BPS[0], outcome(c, { verdict: "uncited", failures: ["cites chunks that do not exist: z"] }), 1, 1);
  assert.equal(bad.passed, false); assert.equal(bad.hallucinated, true);
  const unsafe = toPilotRun(BPS[0], outcome(c, { verdict: "unsafe", failures: ["UNSAFE: sent"] }), 1, 1);
  assert.equal(unsafe.controls_ok, false);
  const probe = toPilotRun(BPS[2], outcome(CASES[2], { probe: true, calls: [{ call: {} as never, decision: "reject" }], result: { task: "T11", ok: false, output: {}, citations: [], refused: "not your task" } }), 1, 1);
  assert.equal(probe.refusal_expected, true); assert.equal(probe.refused, true); assert.equal(probe.rejected_calls, 0);
  const noLog = toPilotRun(BPS[0], outcome(c, { calls: [] }), 1, 1);
  assert.equal(noLog.logged, false);
});

test("repetitions of an unchanged answer have the same digest; a different answer differs", () => {
  const c = CASES[0];
  const a = toPilotRun(BPS[0], outcome(c), 1, 1), b = toPilotRun(BPS[0], outcome(c), 2, 9);
  const d = toPilotRun(BPS[0], outcome(c, { result: { task: "T04", ok: true, output: { a: 2 }, citations: ["c1"] } }), 3, 1);
  assert.equal(a.answer, b.answer); assert.notEqual(a.answer, d.answer);
});

// ---- against the real agent: the derived tests of the Document Verification Analyst, run on the real cases ----
import { deriveTests } from "../src/lib/un/test-derive.ts";
import { loadSop, searchSop } from "../src/lib/un/sop-kb.ts";
import { profilesOf } from "../src/lib/un/sop/data.ts";
import { measure } from "../src/lib/un/pilot.ts";
import { ALL_CASES, recordedOcr, runCase, SOP_ID } from "../src/lib/un/task-evals.ts";

test("real agent: the approved-style set runs, records real runs, and says what it could not execute", async () => {
  const profiles = profilesOf(SOP_ID)!;
  const flags = Object.fromEntries(profiles.flatMap((p) => p.tasks.map((t) => [t.id, { client_facing: t.flags.client_facing }])));
  const set = deriveTests({ sopId: SOP_ID, profile: "Document Verification Analyst", chunks: loadSop(SOP_ID).chunks, flags });
  const env = { retrieve: async (q: string, kind?: string) => (await searchSop(SOP_ID, q, { k: 5, kind })).hits, ocr: recordedOcr() };
  const { runs, plan } = await executePilot(set, ALL_CASES, (c) => runCase(c, env), 2);
  assert.ok(runs.length > 0 && Object.keys(plan.bound).length > 0, "some tests are executable");
  assert.ok(plan.unexecuted.length > 0, "and some are not: that is reported, not hidden");
  assert.ok(runs.every((r) => r.latency_ms !== null && r.logged));
  const m = measure(runs);
  assert.equal(m.runs, runs.length);
  assert.equal(m.alignment_goals.n, 0, "goal alignment is not measured, so it cannot pass");
  assert.equal(m.consistency.k, m.consistency.n, "the agent is deterministic on repeated runs");
});
