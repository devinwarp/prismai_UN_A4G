import assert from "node:assert/strict";
import test from "node:test";
import { GROUP_OF, STAGE_IDS, type Journey, type StageId, type StageState } from "../src/lib/un/journey.ts";
import type { BlockerCode, Readiness } from "../src/lib/un/release-gate.ts";
import { blockerTarget, nextStep } from "../src/lib/un/next-step.ts";

const journey = (states: Partial<Record<StageId, StageState>> = {}, reasons: Partial<Record<StageId, string>> = {}): Journey => ({
  stages: STAGE_IDS.map((id, i) => ({ id, n: i + 1, group: GROUP_OF[id], state: states[id] ?? "done", reason: (reasons[id] as never) ?? null })),
  done: 0, waiting: 0, next: null,
});
const readiness = (codes: BlockerCode[]): Readiness => ({ ok: codes.length === 0, blockers: codes.map((code) => ({ code, message: code })), reports: [] });
const signed = { verdict: "GO_SUPERVISED", by: "p", at: "2026-11-21T14:24:45Z" };

test("blockerTarget sends each blocker code to the page that fixes it", () => {
  assert.equal(blockerTarget("no_profile"), "sop");
  for (const c of ["no_targets", "target_unmeasurable"] as const) assert.equal(blockerTarget(c), "targets");
  for (const c of ["stale_set", "stale_params", "params_looser"] as const) assert.equal(blockerTarget(c), "tests");
  for (const c of ["goals_unapproved", "not_conclusive", "threshold_failed", "control_unmet"] as const) assert.equal(blockerTarget(c), "pilot");
});

test("UC02 shape: six blockers, approval and production done, groups by destination and the before-the-gate flag", () => {
  const r = readiness(["no_targets", "not_conclusive", "threshold_failed", "goals_unapproved", "not_conclusive", "threshold_failed"]);
  assert.deepEqual(nextStep({ readiness: r, journey: journey(), signed }), {
    kind: "blocked", total: 6, groups: [{ target: "pilot", count: 5 }, { target: "targets", count: 1 }], more: 0, approvedBeforeGate: true,
  });
});

test("more than three destinations: the three largest show and more counts the blockers not shown", () => {
  const r = readiness(["no_profile", "no_targets", "stale_set", "stale_params", "not_conclusive", "threshold_failed"]);
  assert.deepEqual(nextStep({ readiness: r, journey: journey(), signed }), {
    kind: "blocked", total: 6, groups: [{ target: "tests", count: 2 }, { target: "pilot", count: 2 }, { target: "sop", count: 1 }], more: 1, approvedBeforeGate: true,
  });
});

test("approvedBeforeGate is false when approval and production are not done", () => {
  const s = nextStep({ readiness: readiness(["no_targets"]), journey: journey({ approval: "not_yet", production: "not_yet" }), signed: null });
  assert.equal(s.kind === "blocked" && s.approvedBeforeGate, false);
});

test("a met gate is never blocked and never carries approvedBeforeGate", () => {
  const s = nextStep({ readiness: readiness([]), journey: journey(), signed });
  assert.equal(s.kind, "ready");
  assert.equal("approvedBeforeGate" in s, false);
});

test("the gate beats a waiting stage", () => {
  const s = nextStep({ readiness: readiness(["no_targets"]), journey: journey({ pilot: "needs_you" }, { pilot: "pilot_not_met" }), signed });
  assert.equal(s.kind, "blocked");
});

test("gate met and a stage needs a person: waiting, the lowest numbered stage first", () => {
  assert.deepEqual(nextStep({ readiness: readiness([]), journey: journey({ approval: "needs_you" }, { approval: "sign" }), signed }), { kind: "waiting", stage: "approval", reason: "sign" });
  const two = nextStep({ readiness: readiness([]), journey: journey({ tuning: "needs_you", approval: "needs_you" }, { tuning: "tune_certify", approval: "sign" }), signed });
  assert.deepEqual(two, { kind: "waiting", stage: "tuning", reason: "tune_certify" });
});

test("a stopped stage beats a blocked gate", () => {
  const s = nextStep({ readiness: readiness(["no_targets"]), journey: journey({ verdict: "stopped" }, { verdict: "no_go" }), signed: null });
  assert.deepEqual(s, { kind: "stopped", stage: "verdict", reason: "no_go" });
});

test("ready passes the last signed verdict through, or null", () => {
  assert.deepEqual(nextStep({ readiness: readiness([]), journey: journey(), signed }), { kind: "ready", signed });
  assert.deepEqual(nextStep({ readiness: readiness([]), journey: journey(), signed: null }), { kind: "ready", signed: null });
});
