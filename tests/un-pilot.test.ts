import assert from "node:assert/strict";
import test from "node:test";
import { wilsonLower } from "../src/lib/un/eval-run.ts";
import { buildReport, judge, measure, measuredGates, percentile, pilotVerdict, wilsonLowerAt, zFor, type PilotRun } from "../src/lib/un/pilot.ts";
import { SG_IMDA, UAE_FEDERAL } from "../src/lib/un/rulesets.ts";
import type { Family } from "../src/lib/un/test-derive.ts";
import { DEFAULT_PARAMS, type Params } from "../src/lib/un/verdict-params.ts";

// All of this data is synthetic: it exercises the arithmetic, it says nothing about any agent.
const run = (o: Partial<PilotRun> = {}): PilotRun => ({
  test_id: "t", family: "happy_path", task: "T04", rep: 1, passed: true, answer: "a", latency_ms: 100, cost: 0.01, hallucinated: false,
  controls_ok: true, goals_ok: true, refusal_expected: false, refused: null, logged: true, rejected_calls: 0, client_facing: false,
  compliance_ok: null, disclosed: null, promotion_free: null, fee_ok: null, ...o,
});

/** `tests` tests for each of three tasks, each repeated `reps` times; T10's are client-facing. */
function dataset(tests = 6, reps = 3, tweak: (r: PilotRun, i: number) => Partial<PilotRun> = () => ({})): PilotRun[] {
  const out: PilotRun[] = [];
  let i = 0;
  for (const task of ["T04", "T05", "T10"]) {
    for (let t = 0; t < tests; t++) {
      for (let rep = 1; rep <= reps; rep++) {
        const cf = task === "T10";
        const base = run({ test_id: `${task}.${t}`, task, rep, client_facing: cf, compliance_ok: cf ? true : null, disclosed: cf ? true : null, promotion_free: cf ? true : null });
        out.push({ ...base, ...tweak(base, i++) });
      }
    }
  }
  // the standard tests every profile has: refuse another role's task, and send what the SOP cannot answer outside
  const refusals: [string, Family, string | null][] = [["refuse.a", "authority", "T11"], ["refuse.b", "authority", "T12"], ["outside.a", "outside_sop", null], ["outside.b", "outside_sop", null], ["outside.c", "outside_sop", null]];
  for (const [id, family, task] of refusals) {
    for (let rep = 1; rep <= reps; rep++) {
      const base = run({ test_id: id, family, task, rep, refusal_expected: true, refused: true });
      out.push({ ...base, ...tweak(base, i++) });
    }
  }
  return out;
}

const P: Params = { ...DEFAULT_PARAMS };
const CF = { client_facing: true, affects_rights: false, irreversible: false };
const reviewer = { approved_infrastructure: "pass", data_lawful: "pass", human_final_approval: "pass" } as const;
const report = (runs: PilotRun[], params = P, extra: object = {}) =>
  buildReport({ runs, params, test_set_hash: "set-hash", ext: "UC02", facts: CF, requested: "GO_AUTONOMOUS", ruleset: UAE_FEDERAL, reviewerGates: { ...reviewer }, ...extra });

test("the confidence maths: z values and the Wilson lower bound agree with the existing eval code at 95%", () => {
  assert.ok(Math.abs(zFor(0.95) - 1.96) < 0.01);
  assert.ok(Math.abs(zFor(0.99) - 2.576) < 0.01);
  assert.ok(Math.abs(zFor(0.9) - 1.645) < 0.01);
  for (const [k, n] of [[60, 60], [28, 30], [0, 10], [5, 5]]) assert.ok(Math.abs(wilsonLowerAt(k, n, 0.95) - wilsonLower(k, n)) < 0.002, `${k}/${n}`);
  assert.equal(wilsonLowerAt(0, 0, 0.95), 0);
  assert.throws(() => zFor(1), /between 0 and 1/);
  assert.equal(percentile([], 0.95), null);
  assert.equal(percentile(Array.from({ length: 100 }, (_, i) => i + 1), 0.95), 95);
});

test("measures: counts per task, repetitions, rates, consistency, p95 latency and mean cost", () => {
  const m = measure(dataset());
  assert.equal(m.runs, 69);
  assert.equal(m.tests, 23);
  assert.deepEqual(m.per_task.T04, { tests: 6, min_reps: 3 });
  assert.deepEqual(Object.keys(m.per_task).sort(), ["T04", "T05", "T10"], "refusal tests of other roles' tasks are not a task of this profile");
  assert.equal(m.min_reps, 3);
  assert.equal(m.accuracy.rate, 1);
  assert.equal(m.consistency.rate, 1);
  assert.equal(m.client_facing_compliance.n, 18, "only the client-facing runs count");
  assert.equal(m.latency_p95_ms, 100);
  assert.ok(Math.abs(m.cost_per_case! - 0.01) < 1e-9);
  assert.equal(m.rejected_calls, 0);
  const noisy = measure(dataset(6, 3, (r) => (r.rep === 2 && r.test_id.endsWith(".0") ? { answer: "different" } : {})));
  assert.equal(noisy.consistency.n, 23);
  assert.equal(noisy.consistency.k, 20, "the three tests whose repetitions differ do not agree");
});

test("a clean, large enough pilot passes every threshold and is conclusive", () => {
  const j = judge(measure(dataset()), P);
  assert.deepEqual(j.failed, []);
  assert.equal(j.conclusive, true);
  assert.equal(j.findings.find((f) => f.measure === "latency_p95_ms")!.ok, null, "no ceiling set");
});

test("accuracy rests on a lower bound: a perfect score on a small sample is not enough", () => {
  const thirty = measure(Array.from({ length: 30 }, (_, i) => run({ test_id: `t${i}` })));
  assert.equal(thirty.accuracy.rate, 1);
  assert.deepEqual(judge(thirty, P).failed.filter((x) => x === "accuracy_lower_bound"), ["accuracy_lower_bound"]);
  const forty = measure(Array.from({ length: 40 }, (_, i) => run({ test_id: `t${i}` })));
  assert.equal(judge(forty, P).findings.find((f) => f.measure === "accuracy_lower_bound")!.ok, true);
  const slips = measure(dataset(6, 3, (_r, i) => ({ passed: i % 18 !== 0 })));
  assert.ok(judge(slips, P).failed.includes("accuracy_lower_bound"));
});

test("hallucination is judged on the observed rate against the approved limit; going over fails the gate and the verdict", () => {
  const atLimit = report(dataset(6, 3, (_r, i) => ({ hallucinated: i < 2 }))); // 2 of 54 is under 5%
  assert.equal(atLimit.findings.find((f) => f.measure === "hallucination")!.ok, true);
  const over = report(dataset(6, 3, (_r, i) => ({ hallucinated: i < 6 })), P, { ruleset: SG_IMDA, reviewerGates: { data_lawful: "pass", human_final_approval: "pass", hallucination_rate: "pass" } });
  assert.equal(over.findings.find((f) => f.measure === "hallucination")!.ok, false);
  assert.equal(over.measured_gates.hallucination_rate, "fail");
  assert.equal(over.verdict, "NO_GO", "the measurement wins over a reviewer's earlier pass");
  assert.match(over.reasons.join(" "), /hallucination/i);
});

test("one call rejected by Sijil fails the audit-log gate and the verdict, whatever else passed", () => {
  const r = report(dataset(6, 3, (_r, i) => ({ rejected_calls: i === 7 ? 1 : 0 })));
  assert.deepEqual(r.failed, ["rejected_calls"]);
  assert.equal(r.measured_gates.audit_log, "fail");
  assert.equal(r.verdict, "NO_GO");
});

test("client-facing compliance is zero tolerance: one failed check among many fails it", () => {
  const r = report(dataset(6, 3, (b) => (b.client_facing && b.test_id === "T10.0" && b.rep === 1 ? { compliance_ok: false } : {})));
  assert.deepEqual(r.failed, ["client_facing_compliance"]);
  const noDisclosure = report(dataset(6, 3, (b) => (b.client_facing && b.test_id === "T10.1" ? { disclosed: false } : {})));
  assert.equal(noDisclosure.measured_gates.ai_disclosure, "fail");
  assert.equal(noDisclosure.verdict, "NO_GO");
});

test("refusal, alignment and audit completeness each have their own threshold", () => {
  const refusals = dataset(6, 3, (b) => (b.test_id.startsWith("T05.") ? { refusal_expected: true, refused: !(b.test_id === "T05.0") } : {}));
  assert.deepEqual(judge(measure(refusals), P).failed, ["refusal"]);
  assert.deepEqual(judge(measure(dataset(6, 3, (_r, i) => ({ controls_ok: i !== 4 }))), P).failed, ["alignment_controls"]);
  assert.deepEqual(judge(measure(dataset(6, 3, (_r, i) => ({ logged: i !== 9 }))), P).failed, ["audit_completeness"]);
  assert.deepEqual(judge(measure(dataset(6, 3, (_r, i) => ({ goals_ok: i % 4 !== 0 }))), P).failed, ["alignment_goals"]);
});

test("a pilot with too few tests or repetitions is inconclusive: no gate passes and the verdict is to escalate", () => {
  const few = report(dataset(2, 3));
  assert.equal(few.conclusive, false);
  assert.match(few.insufficient.join(" "), /T04 has 2 tests; at least 5 are needed/);
  assert.equal(few.measured_gates.audit_log, "unknown");
  assert.equal(few.verdict, "ESCALATE");
  const once = report(dataset(6, 1));
  assert.equal(once.conclusive, false);
  assert.match(once.insufficient.join(" "), /ran 1 time; each needs at least 3/);
  assert.equal(once.verdict, "ESCALATE");
  // a failure is still a failure when the sample is small
  const small = report(dataset(2, 3, (_r, i) => ({ rejected_calls: i === 0 ? 1 : 0 })));
  assert.equal(small.measured_gates.audit_log, "fail");
  assert.equal(small.verdict, "NO_GO");
  const none = report([]);
  assert.match(none.insufficient.join(" "), /no test ran/);
  assert.equal(none.verdict, "ESCALATE");
});

test("optional ceilings: unset is not judged; set and exceeded fails; set but not measured fails", () => {
  const slow = dataset(6, 3, (_r, i) => ({ latency_ms: i % 10 === 0 ? 9000 : 100 }));
  assert.equal(judge(measure(slow), P).findings.find((f) => f.measure === "latency_p95_ms")!.ok, null);
  assert.deepEqual(judge(measure(slow), { ...P, latency_p95_ms_max: 2000 }).failed, ["latency_p95_ms"]);
  assert.equal(judge(measure(slow), { ...P, latency_p95_ms_max: 20000 }).failed.length, 0);
  const unmeasured = dataset(6, 3, () => ({ latency_ms: null, cost: null }));
  const j = judge(measure(unmeasured), { ...P, latency_p95_ms_max: 2000, cost_per_case_max: 1 });
  assert.deepEqual(j.failed, ["latency_p95_ms", "cost_per_case"]);
  assert.match(j.findings.find((f) => f.measure === "cost_per_case")!.note!, /nothing was measured/);
});

test("a clean conclusive pilot gives the verdict the engine would give: the requested level, capped for a client-facing case", () => {
  const r = report(dataset());
  assert.equal(r.conclusive, true);
  assert.deepEqual(r.failed, []);
  assert.equal(r.verdict, "GO_SUPERVISED");
  assert.equal(r.measured_gates.audit_log, "pass");
  assert.equal(r.measured_gates.ai_disclosure, "pass");
  assert.equal(r.measured_gates.fee_accuracy, "unknown", "no fee test ran, so there is no evidence either way");
});

test("a pilot measures only the gates that rest on evals or Sijil, and never touches the reviewer's", () => {
  const g = measuredGates(measure(dataset()), P, judge(measure(dataset()), P));
  assert.deepEqual(Object.keys(g).sort(), ["ai_disclosure", "audit_log", "fee_accuracy", "hallucination_rate", "no_commercial_promotion"]);
  const merged = pilotVerdict({ ext: "UC02", facts: CF, requested: "GO_AUTONOMOUS", ruleset: UAE_FEDERAL, reviewerGates: { ...reviewer, approved_infrastructure: "fail" }, measured: g });
  assert.equal(merged.gates.approved_infrastructure, "fail", "a reviewer's gate is left as the reviewer set it");
  assert.equal(merged.decision.verdict, "NO_GO");
});

test("the report is bound to the approved test set and parameters, and is reproducible", () => {
  const a = report(dataset());
  assert.equal(a.test_set_hash, "set-hash");
  assert.equal(a.report_hash, report(dataset()).report_hash);
  const stricter = report(dataset(), { ...P, hallucination_max: 0.01 });
  assert.notEqual(stricter.params_hash, a.params_hash);
  assert.notEqual(stricter.report_hash, a.report_hash);
  assert.notEqual(report(dataset(), P, { test_set_hash: "another" }).report_hash, a.report_hash);
});
