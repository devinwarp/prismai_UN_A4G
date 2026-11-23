import assert from "node:assert/strict";
import test from "node:test";
import type { Review } from "../src/lib/un/goal-judge.ts";
import type { PilotReport } from "../src/lib/un/pilot.ts";
import { paramProblem, releaseReadiness, unmetTests, type ProfileEvidence } from "../src/lib/un/release-gate.ts";
import type { Target } from "../src/lib/un/targets.ts";
import { DEFAULT_PARAMS } from "../src/lib/un/verdict-params.ts";

const SET = "set1", PARAMS = "par1";
const report = (over: Partial<PilotReport> = {}): PilotReport => ({ test_set_hash: SET, params_hash: PARAMS, conclusive: true, failed: [], insufficient: [], report_hash: "rep1", ...over }) as unknown as PilotReport;
const review = (judgments: { test_id: string; goals: { id: string; met: boolean }[] }[], overrides: { test_id: string; met: boolean }[] = [], approved = true): Review =>
  ({ pilot_id: "p1", model: "m", judgments: judgments.map((j) => ({ ...j, met: j.goals.every((g) => g.met), goals: j.goals.map((g) => ({ ...g, reason: "" })), reason: "" })), goal_set: null, approved: approved ? { approver: "A", approver_source: "s", overrides, hash: "h", by: "u", at: "t" } : null }) as unknown as Review;
const good = (over: Partial<ProfileEvidence> = {}): ProfileEvidence => ({
  profile: "Fee and Payment Officer", set_hash: SET, params: { ...DEFAULT_PARAMS, accuracy_lower_bound_min: 0.98 }, params_hash: PARAMS, report: report(), basis_pilot_id: "p1", original_pilot_id: "p1",
  review: review([{ test_id: "t1", goals: [{ id: "C1", met: true }] }, { test_id: "t2", goals: [{ id: "C1", met: true }, { id: "C2", met: true }] }]), rulings: [], ...over,
});
const tgt = (o: Partial<Target> & { id: string }): Target => ({ kind: "outcome", goal_id: "MARSA-G1", statement: "A statement", comparator: "min", value: 98, unit: "percent", measured_by: "pilot", evidence: "how it is measured", ...o });
const targets: Target[] = [
  tgt({ id: "T1", param_key: "accuracy_lower_bound_min" }),
  tgt({ id: "T6", measured_by: "go_live" }),
  tgt({ id: "C1", kind: "control", goal_id: undefined, comparator: "max", value: 0, unit: "count", check: { criterion: "hallucination", scope: "all" } }),
  tgt({ id: "C2", kind: "control", goal_id: undefined, comparator: "max", value: 0, unit: "count", check: { criterion: "human_final_approval", scope: "client_facing" } }),
];
const codes = (r: ReturnType<typeof releaseReadiness>) => r.blockers.map((b) => b.code);

test("a met pilot with proven controls, parameters at least as strict as the targets and approved goals is ready, and the readiness names the reports", () => {
  const r = releaseReadiness({ profiles: [good()], targets });
  assert.deepEqual(r.blockers, []);
  assert.equal(r.ok, true);
  assert.deepEqual(r.reports, [{ profile: "Fee and Payment Officer", report_hash: "rep1", test_set_hash: SET, params_hash: PARAMS, pilot_id: "p1" }]);
});

test("nothing ticked, or no approved targets, is not ready", () => {
  assert.deepEqual(codes(releaseReadiness({ profiles: [], targets })), ["no_profile"]);
  assert.ok(codes(releaseReadiness({ profiles: [good()], targets: null })).includes("no_targets"));
  assert.ok(codes(releaseReadiness({ profiles: [good()], targets: [] })).includes("no_targets"));
});

test("a profile with no pilot, or a pilot that ran under a test set or parameters that are not the approved ones now, is stale", () => {
  assert.ok(codes(releaseReadiness({ profiles: [good({ report: null, basis_pilot_id: null, original_pilot_id: null, review: null })], targets })).includes("no_pilot"));
  assert.ok(codes(releaseReadiness({ profiles: [good({ set_hash: "other" })], targets })).includes("stale_set"));
  assert.ok(codes(releaseReadiness({ profiles: [good({ set_hash: null })], targets })).includes("stale_set"));
  assert.ok(codes(releaseReadiness({ profiles: [good({ params_hash: "other" })], targets })).includes("stale_params"));
});

test("goal alignment must be judged and approved: a pilot as run, or a review without an approval, is not enough", () => {
  assert.ok(codes(releaseReadiness({ profiles: [good({ basis_pilot_id: null })], targets })).includes("goals_unapproved"));
  assert.ok(codes(releaseReadiness({ profiles: [good({ review: review([], [], false) })], targets })).includes("goals_unapproved"));
  assert.ok(codes(releaseReadiness({ profiles: [good({ review: null })], targets })).includes("goals_unapproved"));
});

test("an inconclusive report, or a failing threshold, blocks, and says why", () => {
  const a = releaseReadiness({ profiles: [good({ report: report({ conclusive: false, insufficient: ["T11: 1 repetition, 3 needed"] }) })], targets });
  assert.ok(codes(a).includes("not_conclusive"));
  assert.match(a.blockers.find((b) => b.code === "not_conclusive")!.message, /1 repetition, 3 needed/);
  const b = releaseReadiness({ profiles: [good({ report: report({ failed: ["accuracy_lower_bound", "refusal"] }) })], targets });
  assert.match(b.blockers.find((x) => x.code === "threshold_failed")!.message, /accuracy_lower_bound, refusal/);
});

test("a disputed generated case needs a ruling; one ruled an agent failure blocks; one ruled an expectation error does not", () => {
  const gen = { tests: 2, runs: 6, agree: 0, disputed: 2, cases: [{ test_id: "manual.1#manual.1", case_id: "c1", reps: 3, disputed_reps: 3, differences: ["x"] }, { test_id: "manual.2#manual.2", case_id: "c2", reps: 3, disputed_reps: 1, differences: ["y"] }] };
  const rule = (case_id: string, ruling: "agent_wrong" | "expectation_wrong") => ({ case_id, pilot_id: "p1", ruling, reason: "r", by: "u", at: "t" });
  const base = (rulings: ReturnType<typeof rule>[]) => releaseReadiness({ profiles: [good({ report: report({ generated: gen }), rulings })], targets });
  assert.deepEqual(codes(base([])).filter((c) => c.startsWith("generated")), ["generated_unruled", "generated_unruled"]);
  assert.deepEqual(codes(base([rule("c1", "expectation_wrong"), rule("c2", "agent_wrong")])).filter((c) => c.startsWith("generated")), ["generated_agent_wrong"]);
  assert.equal(base([rule("c1", "expectation_wrong"), rule("c2", "expectation_wrong")]).ok, true);
  // a ruling made for another pilot does not count
  assert.ok(codes(releaseReadiness({ profiles: [good({ report: report({ generated: gen }), rulings: [{ ...rule("c1", "expectation_wrong"), pilot_id: "other" }, rule("c2", "expectation_wrong")] })], targets })).includes("generated_unruled"));
});

test("a pilot-measured target must feed a parameter or carry a check; a go-live target needs neither", () => {
  const t = [tgt({ id: "T5" })];
  assert.deepEqual(codes(releaseReadiness({ profiles: [good()], targets: t })), ["target_unmeasurable"]);
  assert.equal(releaseReadiness({ profiles: [good()], targets: [tgt({ id: "T5", measured_by: "go_live" })] }).ok, true);
  assert.deepEqual(codes(releaseReadiness({ profiles: [good()], targets: [tgt({ id: "K", kind: "control", goal_id: undefined })] })), ["target_unmeasurable"]);
});

test("the approved parameters must be at least as strict as the targets they feed", () => {
  assert.equal(paramProblem(tgt({ id: "T1", param_key: "accuracy_lower_bound_min" }), { ...DEFAULT_PARAMS, accuracy_lower_bound_min: 0.9 }) !== null, true);
  assert.equal(paramProblem(tgt({ id: "T1", param_key: "accuracy_lower_bound_min" }), { ...DEFAULT_PARAMS, accuracy_lower_bound_min: 0.98 }), null);
  assert.equal(paramProblem(tgt({ id: "T1", param_key: "accuracy_lower_bound_min" }), { ...DEFAULT_PARAMS, accuracy_lower_bound_min: 0.99 }), null);
  assert.ok(paramProblem(tgt({ id: "H", param_key: "hallucination_max", comparator: "max", value: 1 }), { ...DEFAULT_PARAMS, hallucination_max: 0.05 }));
  assert.equal(paramProblem(tgt({ id: "H", param_key: "hallucination_max", comparator: "max", value: 5 }), { ...DEFAULT_PARAMS, hallucination_max: 0.05 }), null);
  // a count target has no common unit with its parameter, a go-live target is not run, and no parameter set is nothing to compare
  assert.equal(paramProblem(tgt({ id: "Z", param_key: "hallucination_max", comparator: "max", value: 0, unit: "count" }), DEFAULT_PARAMS), null);
  assert.equal(paramProblem(tgt({ id: "G", param_key: "accuracy_lower_bound_min", measured_by: "go_live" }), DEFAULT_PARAMS), null);
  assert.equal(paramProblem(tgt({ id: "N", param_key: "accuracy_lower_bound_min" }), null), null);
  const r = releaseReadiness({ profiles: [good({ params: { ...DEFAULT_PARAMS, accuracy_lower_bound_min: 0.9 } })], targets });
  assert.ok(codes(r).includes("params_looser"));
  assert.match(r.blockers.find((b) => b.code === "params_looser")!.message, /accuracy_lower_bound_min is 0\.9, looser than the 0\.98 that target T1 asks/);
});

test("a control must have been asked of some test and held on all of them; a person's override of a test clears it", () => {
  const miss = review([{ test_id: "t1", goals: [{ id: "C1", met: true }] }, { test_id: "t2", goals: [{ id: "C1", met: false }] }]);
  const a = releaseReadiness({ profiles: [good({ review: miss })], targets });
  assert.ok(codes(a).includes("control_unmet"));
  assert.match(a.blockers.find((b) => b.code === "control_unmet")!.message, /control C1 .* was not met on 1 of 2 tests \(t2\)/);
  // C2 is asked of no test here
  assert.ok(codes(a).includes("control_unmeasured"));
  assert.deepEqual(unmetTests(miss, "C1"), { judged: 2, unmet: ["t2"] });
  const cleared = review([{ test_id: "t1", goals: [{ id: "C1", met: true }, { id: "C2", met: true }] }, { test_id: "t2", goals: [{ id: "C1", met: false }, { id: "C2", met: true }] }], [{ test_id: "t2", met: true }]);
  assert.equal(releaseReadiness({ profiles: [good({ review: cleared })], targets }).ok, true);
  assert.deepEqual(unmetTests(cleared, "C1"), { judged: 2, unmet: [] });
});

test("every blocker names what to do about it, and a profile's blockers are labelled with the profile", () => {
  const r = releaseReadiness({ profiles: [good({ set_hash: null, params_hash: null, report: report({ conclusive: false }) })], targets });
  assert.ok(r.blockers.length >= 3);
  assert.ok(r.blockers.filter((b) => b.profile).every((b) => b.message.startsWith("Fee and Payment Officer: ")));
  assert.ok(r.blockers.every((b) => b.message.length > 20));
});

const withMeasures = (m: Record<string, { k: number; n: number }>, hallucinationK = 0) => report({ measures: { disclosure: m.disclosure ?? { k: 0, n: 0 }, client_facing_compliance: m.compliance ?? { k: 0, n: 0 }, fee: m.fee ?? { k: 0, n: 0 }, hallucination: { k: hallucinationK, n: 100 } } as never });

test("a control the pilot measures in code is proven by that measure, whatever a model judged", async () => {
  const { measuredProof } = await import("../src/lib/un/release-gate.ts");
  const judgedBad = review([{ test_id: "t1", goals: [{ id: "C1", met: false }, { id: "C2", met: false }] }]);
  const held = withMeasures({ disclosure: { k: 7, n: 7 }, compliance: { k: 7, n: 7 }, fee: { k: 7, n: 7 } });
  // the model said no on both, but the measures say every message kept the rule: proven
  assert.equal(releaseReadiness({ profiles: [good({ report: held, review: judgedBad })], targets }).blockers.filter((b) => b.code.startsWith("control")).length, 0);
  assert.deepEqual(measuredProof("ai_disclosure", held), { k: 7, n: 7, also_ok: true });
  assert.deepEqual(measuredProof("human_final_approval", held), { k: 7, n: 7, also_ok: true });
  assert.equal(measuredProof("accuracy", held), null, "accuracy has no measure in code: the judgments decide");
  assert.equal(measuredProof("hallucination", null), null);
  // one message missed the rule: unmet, with the count
  const missed = withMeasures({ compliance: { k: 6, n: 7 }, fee: { k: 7, n: 7 } });
  const a = releaseReadiness({ profiles: [good({ report: missed })], targets });
  assert.match(a.blockers.find((b) => b.code === "control_unmet" && b.target === "C2")!.message, /did not hold on every message the pilot measured it on \(6 of 7\)/);
  // a fee that held, but a claim with no support elsewhere in the pilot, is not proven
  const unsupported = withMeasures({ fee: { k: 7, n: 7 }, compliance: { k: 7, n: 7 } }, 2);
  assert.match(releaseReadiness({ profiles: [good({ report: unsupported })], targets }).blockers.find((b) => b.target === "C1")!.message, /a claim had no support/);
  // nothing measured (no message was written): the judgments decide, as before
  const none = withMeasures({});
  assert.ok(codes(releaseReadiness({ profiles: [good({ report: none, review: judgedBad })], targets })).includes("control_unmet"));
});

test("a run's summary keeps the citations and the release flag in front of the output; one with a message is not cut inside it", async () => {
  const { toPilotRun } = await import("../src/lib/un/pilot-run.ts");
  const big = "x".repeat(1300);
  const o = (output: Record<string, unknown>) => ({ id: "c", task: "T12", title: "t", split: "holdout", verdict: "correct", failures: [], calls: [], probe: false, agent: "fp", result: { task: "T12", ok: true, output, citations: ["SOP-LIC-014#S6"], needs_human: true } }) as never;
  const bp = { id: "T12.cf.x", family: "client_facing", task: "T12" } as never;
  const withBody = toPilotRun(bp, o({ notice: { amount: 2200 }, email: { to: "a@b.example", body: big } }), 1, 1);
  assert.ok(withBody.summary!.length > 900 && withBody.summary!.length <= 1800);
  assert.ok(withBody.summary!.indexOf('"citations"') < withBody.summary!.indexOf('"output"'));
  assert.ok(withBody.summary!.indexOf('"needs_human":true') < withBody.summary!.indexOf('"output"'));
  const plain = toPilotRun({ id: "T11.happy", family: "happy_path", task: "T11" } as never, o({ filler: big + big }), 1, 1);
  assert.equal(plain.summary!.length, 900);
});

test("the judge asks the message checks only of a run that wrote a message", async () => {
  const { testsToJudge } = await import("../src/lib/un/goal-judge.ts");
  const run = (test_id: string, disclosed: boolean | null) => ({ test_id, family: "client_facing", task: "T12", rep: 1, passed: true, answer: "a", summary: "{}", latency_ms: 1, cost: null, hallucinated: null, controls_ok: true, goals_ok: null, refusal_expected: false, refused: null, logged: true, rejected_calls: 0, client_facing: true, compliance_ok: true, disclosed, promotion_free: null, fee_ok: null }) as never;
  const t = testsToJudge([run("hands-over", null), run("drafted", true)], {});
  assert.deepEqual(t.map((x) => [x.test_id, x.client_facing]), [["hands-over", false], ["drafted", true]]);
});
