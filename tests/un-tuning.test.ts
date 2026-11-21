import assert from "node:assert/strict";
import test from "node:test";
import { activeCases, evalSetFor, noDesignation } from "../src/lib/un/evalset.ts";
import { runEvalSet } from "../src/lib/un/eval-run.ts";
import { baselineConfig } from "../src/lib/un/subject.ts";
import { appendEntry, approvalState, runBlockedReason, applyProposals, canon, configOf, designationOf, optimise, runTuningCycle, verifyChain, type LogEntry } from "../src/lib/un/tuning.ts";

const clock = () => {
  let n = 0;
  return () => new Date(Date.UTC(2026, 10, 20, 8, 0, n++)).toISOString();
};
const cycle = (uc: string, all = evalSetFor(uc)) =>
  runTuningCycle({ base: baselineConfig(`${uc}-agent`), all, designation: noDesignation(), actor: "optimiser", now: clock() });

test("the optimiser reads tuning cases only", () => {
  const run = runEvalSet(baselineConfig("a"), activeCases(evalSetFor("UC02")));
  assert.throws(() => optimise(baselineConfig("a"), run.results), /tuning cases only/);
  const tune = run.results.filter((r) => r.split === "tune");
  const { proposals } = optimise(baselineConfig("a"), tune);
  assert.deepEqual(proposals.map((p) => p.id).sort(), ["add_rule:answer_from_record_only", "add_rule:use_only_allowed_tools", "remove_tool:export_applicant_file"]);
  assert.ok(proposals.every((p) => p.because.every((id) => tune.some((t) => t.case_id === id))), "each change names the tuning cases that caused it");
});

test("UC02: tuning fixes what the tuning cases show, the held-out set still finds a gap, and a second round certifies", () => {
  const out = cycle("UC02");
  const kinds = out.entries.map((e) => e.kind);
  assert.equal(kinds[0], "baseline");
  assert.ok(kinds.includes("iteration") && kinds.includes("holdout_burned"));
  assert.equal(kinds.filter((k) => k === "certification").length, 2, "failed once, then passed");
  const cert = out.entries.filter((e) => e.kind === "certification");
  assert.equal(cert[0].payload.met, false);
  assert.equal(cert[1].payload.met, true);
  assert.equal(out.stopped, "certified");
  const burn = out.entries.find((e) => e.kind === "holdout_burned")!;
  assert.deepEqual(burn.payload.burned, ["UC02-07"]);
  assert.deepEqual(burn.payload.released, ["UC02-09"]);
  assert.deepEqual(out.designation, { promoted: ["UC02-07"], released: ["UC02-09"] });
  assert.equal(approvalState(out.entries), "ready");
  assert.deepEqual(out.config.rules.sort(), ["answer_from_record_only", "disclose_ai", "officer_release", "use_only_allowed_tools"]);
  assert.ok(!out.config.tools.includes("export_applicant_file"));
  assert.match(out.config.system_prompt, /Queue every message for a citizen with an officer/);
});

test("UC01 also certifies after burning one held-out case", () => {
  const out = cycle("UC01");
  assert.equal(out.stopped, "certified");
  assert.deepEqual(out.entries.find((e) => e.kind === "holdout_burned")!.payload.burned, ["UC01-08"]);
});

test("held-out cases cannot steer the optimiser: changing them does not change the tuning iterations", () => {
  const all = evalSetFor("UC02");
  const altered = all.map((c) => (c.split === "holdout" ? { ...c, trap: "none" as const, expected: { ...c.expected, citizen_facing: false } } : c));
  const firstIterations = (es: LogEntry[]) => {
    const burn = es.findIndex((e) => e.kind === "holdout_burned");
    return es.slice(0, burn < 0 ? es.length : burn).filter((e) => e.kind === "iteration").map((e) => canon([e.payload.proposals, e.payload.config]));
  };
  assert.deepEqual(firstIterations(cycle("UC02", altered).entries), firstIterations(cycle("UC02", all).entries));
});

test("each iteration improves or holds the tuning result, and the holdout stays sealed until certification", () => {
  const out = cycle("UC02");
  const iterations = out.entries.filter((x) => x.kind === "iteration");
  assert.ok(iterations.length >= 1);
  for (const e of iterations) {
    assert.ok((e.payload.tune_after as { correct: number }).correct >= (e.payload.tune_before as { correct: number }).correct);
    assert.equal(e.payload.holdout_sealed, true);
    assert.ok(!("holdout" in e.payload), "an iteration entry carries no held-out result");
  }
});

test("the log is a hash chain: verifies, and any edit, deletion or reordering is detected", () => {
  const es = cycle("UC02").entries;
  assert.deepEqual(verifyChain(es), { ok: true });
  const edited = es.map((e) => ({ ...e, payload: { ...e.payload } }));
  (edited[1].payload as Record<string, unknown>).to_version = 99;
  const r = verifyChain(edited);
  assert.ok(!r.ok && r.broken_seq === edited[1].seq);
  assert.ok(!verifyChain([es[0], ...es.slice(2)]).ok, "deleted entry");
  assert.ok(!verifyChain([es[1], es[0], ...es.slice(2)]).ok, "reordered");
});

test("the hash does not depend on key order, so it survives a database round trip", () => {
  assert.equal(canon({ b: 1, a: { d: 2, c: [3, { y: 1, x: 2 }] } }), canon({ a: { c: [3, { x: 2, y: 1 }], d: 2 }, b: 1 }));
  const es = cycle("UC02").entries;
  const roundTripped = JSON.parse(JSON.stringify(es)).map((e: LogEntry) => ({ ...e, payload: JSON.parse(canon(e.payload)) }));
  assert.deepEqual(verifyChain(roundTripped), { ok: true });
});

test("state is replayed from the log: designation, configuration, approval", () => {
  const out = cycle("UC02");
  assert.deepEqual(designationOf(out.entries), out.designation);
  assert.deepEqual(configOf(out.entries), out.config);
  assert.equal(approvalState([]), "none");
  const signed = appendEntry(out.entries[out.entries.length - 1], "approval", "officer", { version: out.config.version, decision: "SIGN", signer: "officer", comment: "ok" }, "2026-11-20T09:00:00.000Z");
  assert.equal(approvalState([...out.entries, signed]), "approved");
  assert.equal(approvalState(out.entries.slice(0, 3)), "none", "mid-run is not ready");
});

test("the log can continue an existing chain", () => {
  const first = cycle("UC02");
  const more = runTuningCycle({ base: first.config, all: evalSetFor("UC02"), designation: first.designation, actor: "optimiser", now: clock(), prev: first.entries[first.entries.length - 1] });
  assert.deepEqual(verifyChain([...first.entries, ...more.entries]), { ok: true });
  assert.equal(more.stopped, "certified");
  assert.equal(more.entries.filter((e) => e.kind === "iteration").length, 0, "nothing left to tune");
});

test("with no reserve cases left, a failed certification stops instead of looping", () => {
  const noReserve = evalSetFor("UC02").filter((c) => c.split !== "reserve");
  const out = cycle("UC02", noReserve);
  assert.equal(out.stopped, "no_reserve");
  assert.notEqual(approvalState(out.entries), "ready");
});

test("applying proposals bumps the version and never removes an existing rule", () => {
  const base = baselineConfig("a");
  const next = applyProposals(base, [{ id: "x", op: "add_rule", rule: "disclose_ai", summary: "", because: [] }]);
  assert.equal(next.version, 2);
  assert.deepEqual(next.rules, ["disclose_ai"]);
  assert.equal(applyProposals(next, [{ id: "x", op: "add_rule", rule: "disclose_ai", summary: "", because: [] }]).system_prompt, next.system_prompt, "no duplicate prompt text");
});

test("the Run-a-tuning-cycle button is blocked (with a reason) exactly in the states where the route answers 409", () => {
  assert.equal(runBlockedReason("none"), null);
  assert.match(runBlockedReason("ready")!, /certified/i);
  assert.match(runBlockedReason("approved")!, /approved/i);
});
