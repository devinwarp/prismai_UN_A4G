import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ENTITY_GOALS } from "../src/lib/un/goals.ts";
import { appendTargets, checksOf, controlsOf, coverage, describeTarget, describeTargetStoreError, planTargets, replayTargets, targetsHash, validateTargets, verifyTargets, EMPTY_TARGETS, type Target, type TargetEntry, type TargetState } from "../src/lib/un/targets.ts";

const goals = ENTITY_GOALS["Marsa Public Services Authority"];
const t = (over: Partial<Target> = {}): Target => ({ id: "T1", goal_id: "MARSA-G1", statement: "First-response accuracy on officer-reviewed cases", comparator: "min", value: 98, unit: "percent", measured_by: "pilot", evidence: "officer-reviewed sample of pilot cases", ...over });
const approver = { title: "Head of Licensing", source: "process_owner" };

test("a valid target set passes", () => assert.deepEqual(validateTargets([t(), t({ id: "T2", goal_id: "MARSA-G2", comparator: "max", value: 0, unit: "count", statement: "Unsupported fee quotes", param_key: "hallucination_max" })], goals), []));

test("validation rejects the usual mistakes", () => {
  const e = (x: unknown) => validateTargets(x, goals).join(" | ");
  assert.match(e([]), /at least one/);
  assert.match(e("x"), /list/);
  assert.match(e([t({ goal_id: "OTHER-G1" })]), /not a goal of this entity/);
  assert.match(e([t(), t()]), /used twice/);
  assert.match(e([t({ value: 120 })]), /above 100/);
  assert.match(e([t({ value: -1 })]), /negative/);
  assert.match(e([t({ value: NaN })]), /must be a number/);
  assert.match(e([t({ statement: "x" })]), /statement/);
  assert.match(e([t({ evidence: "" })]), /how it is measured/);
  assert.match(e([t({ unit: "weeks" as never })]), /unit/);
  assert.match(e([t({ param_key: "nope" })]), /unknown verdict parameter/);
  assert.match(e([t({ measured_by: "go_live", param_key: "hallucination_max" })]), /go-live target cannot feed/);
  assert.match(e([{ ...t(), extra: 1 }]), /unknown field/);
});

test("propose, approve and withdraw replay into state", () => {
  let log: TargetEntry[] = [];
  const apply = (action: Parameters<typeof planTargets>[1], by: string) => {
    const p = planTargets(replayTargets(log), action, by, goals);
    assert.ok(p.ok, p.ok ? "" : p.error);
    if (p.ok) log = [...log, appendTargets(log[log.length - 1] ?? null, p.kind, by, p.payload, `2026-11-23T10:0${log.length}:00Z`)];
  };
  apply({ type: "propose", targets: [t()] }, "owner");
  assert.equal(replayTargets(log).pending?.version, 1);
  apply({ type: "approve", approver }, "someone-else");
  const s = replayTargets(log);
  assert.equal(s.approved?.version, 1);
  assert.equal(s.approved?.hash, targetsHash([t()]));
  assert.equal(s.pending, null);
  apply({ type: "withdraw", reason: "targets revised" }, "someone-else");
  assert.equal(replayTargets(log).approved, null);
  assert.ok(verifyTargets(log).ok);
});

test("a proposer cannot approve their own targets without a reason", () => {
  const pending: TargetState = { ...EMPTY_TARGETS, proposals: 1, pending: { version: 1, targets: [t()], by: "owner" } };
  const no = planTargets(pending, { type: "approve", approver }, "owner", goals);
  assert.ok(!no.ok && /cannot also approve/.test(no.error));
  const yes = planTargets(pending, { type: "approve", approver, self_approval_reason: "sole owner" }, "owner", goals);
  assert.ok(yes.ok && yes.payload.self_approval_reason === "sole owner");
});

test("approval re-checks the goals: a goal removed since the proposal blocks it", () => {
  const pending: TargetState = { ...EMPTY_TARGETS, proposals: 1, pending: { version: 1, targets: [t()], by: "owner" } };
  const p = planTargets(pending, { type: "approve", approver }, "someone-else", goals.filter((g) => g.id !== "MARSA-G1"));
  assert.ok(!p.ok && /no longer fits/.test(p.error));
});

test("an unchanged approved set cannot be proposed again; withdrawing needs an approval and a reason", () => {
  const approved: TargetState = { ...EMPTY_TARGETS, proposals: 1, approved: { version: 1, hash: targetsHash([t()]), targets: [t()], approver: "x", approver_source: "governance", at: "now", by: "o" } };
  const again = planTargets(approved, { type: "propose", targets: [t()] }, "owner", goals);
  assert.ok(!again.ok && /already approved/.test(again.error));
  const none = planTargets(EMPTY_TARGETS, { type: "withdraw", reason: "because" }, "o", goals);
  assert.ok(!none.ok && /no approval/.test(none.error));
  const short = planTargets(approved, { type: "withdraw", reason: "" }, "o", goals);
  assert.ok(!short.ok && /needs a reason/.test(short.error));
});

test("the hash does not depend on the order of targets", () => {
  const a = t(), b = t({ id: "T2", goal_id: "MARSA-G2" });
  assert.equal(targetsHash([a, b]), targetsHash([b, a]));
  assert.notEqual(targetsHash([a]), targetsHash([t({ value: 97 })]));
});

test("coverage lists every goal, with the targets that contribute and the goals that have none", () => {
  const c = coverage(goals, [t(), t({ id: "T2", goal_id: "MARSA-G1" })]);
  assert.equal(c.length, goals.length);
  assert.equal(c.find((x) => x.goal.id === "MARSA-G1")?.targets.length, 2);
  assert.deepEqual(c.filter((x) => x.targets.length === 0).map((x) => x.goal.id), ["MARSA-G2"]);
});

test("a target can carry a per-test check; checksOf hands those to the goal judge", () => {
  const ck = t({ id: "T3", statement: "No message leaves without a recorded officer approval", comparator: "max", value: 0, unit: "count", check: { criterion: "human_final_approval", scope: "client_facing" } });
  assert.deepEqual(validateTargets([t(), ck], goals), []);
  assert.deepEqual(checksOf([t(), ck]), [{ id: "T3", text: "No message leaves without a recorded officer approval", criterion: "human_final_approval", scope: "client_facing" }]);
  assert.match(validateTargets([t({ check: { criterion: "goal_alignment" as never, scope: "all" } })], goals).join(), /check criterion/);
  assert.match(validateTargets([t({ check: { criterion: "accuracy", scope: "some" as never } })], goals).join(), /check scope/);
  assert.match(validateTargets([t({ measured_by: "go_live", check: { criterion: "accuracy", scope: "all" } })], goals).join(), /go-live target cannot be checked/);
});

test("describeTarget reads naturally", () => {
  assert.equal(describeTarget(t()), "at least 98 %");
  assert.equal(describeTarget(t({ comparator: "max", value: 2, unit: "business_hours" })), "at most 2 business hours");
});

test("a missing table says which file to apply", () => {
  assert.match(describeTargetStoreError("Could not find the table 'public.un_target_log' in the schema cache"), /supabase\/un-targets\.sql/);
  assert.equal(describeTargetStoreError("permission denied"), "permission denied");
});

test("the migration is append-only and one chain per use case", () => {
  const sql = readFileSync(new URL("../supabase/un-targets.sql", import.meta.url), "utf8");
  assert.match(sql, /create table if not exists public\.un_target_log/);
  assert.match(sql, /unique \(use_case_id, seq\)/);
  assert.match(sql, /before update on public\.un_target_log/);
  assert.match(sql, /before delete on public\.un_target_log/);
});

test("a control target has no goal link; an outcome target needs one; an untagged target is an outcome", () => {
  const control = t({ id: "C1", kind: "control", goal_id: undefined, statement: "An officer releases every message", comparator: "max", value: 0, unit: "count", check: { criterion: "human_final_approval", scope: "client_facing" } });
  assert.deepEqual(validateTargets([t(), control], goals), []);
  assert.deepEqual(controlsOf([t(), control]).map((x) => x.id), ["C1"]);
  assert.match(validateTargets([{ ...control, goal_id: "MARSA-G1" }], goals).join(), /not linked to a goal/);
  assert.match(validateTargets([t({ kind: "outcome", goal_id: undefined })], goals).join(), /not a goal of this entity/);
  assert.match(validateTargets([t({ kind: "rule" as never })], goals).join(), /kind must be/);
  // controls still reach the judge as checks, and they are not counted in any goal's coverage
  assert.equal(checksOf([control]).length, 1);
  assert.ok(coverage(goals, [control]).every((c) => c.targets.length === 0));
});
