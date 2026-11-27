import assert from "node:assert/strict";
import test from "node:test";
import type { EntityGoal } from "../src/lib/un/goals.ts";
import { validateTargets } from "../src/lib/un/targets.ts";
import { applyPolish, approvalRuleWarning, draftTargets, draftWithWording, unitOf, type DraftUseCase } from "../src/lib/un/targets-draft.ts";

const goals: EntityGoal[] = [
  { id: "S-G1", text: "Candidates are satisfied with the process", criterion: null, measurement: { criterion: "Post-process survey, share satisfied", comparison: "at_least", value: 90, unit: "%" } },
  { id: "S-G2", text: "Candidates get a timely acknowledgement", criterion: null, measurement: { criterion: "Portal timestamps", comparison: "at_most", value: 1, unit: "business hours" } },
];
const uc = (over: Partial<DraftUseCase> = {}): DraftUseCase => ({ ext_id: "UC09", title: "Recruitment and onboarding agent", entity: "Sahel", client_facing: true, affects_rights: true, irreversible: false, ...over });

test("one outcome target per goal carries the goal's own value, unit and comparison", () => {
  const t = draftTargets(goals, uc({ client_facing: false, affects_rights: false }));
  assert.equal(t.length, 2);
  assert.deepEqual(t.map((x) => [x.id, x.kind, x.goal_id, x.comparator, x.value, x.unit, x.measured_by]), [
    ["T1", "outcome", "S-G1", "min", 90, "percent", "go_live"],
    ["T2", "outcome", "S-G2", "max", 1, "business_hours", "go_live"],
  ]);
  assert.match(t[0].evidence, /Post-process survey/);
});

test("control targets come only from the use case's own flags", () => {
  const ids = (o: Partial<DraftUseCase>) => draftTargets(goals, uc(o)).filter((t) => t.kind === "control").map((t) => `${t.check?.criterion}/${t.check?.scope}`);
  assert.deepEqual(ids({ client_facing: false, affects_rights: false, irreversible: false }), []);
  assert.deepEqual(ids({ client_facing: true, affects_rights: false }), ["ai_disclosure/client_facing"]);
  assert.deepEqual(ids({ client_facing: false, irreversible: true, affects_rights: false }), ["human_final_approval/all"]);
  assert.deepEqual(ids({ client_facing: true, affects_rights: true, irreversible: true }), ["ai_disclosure/client_facing", "human_final_approval/all"]);
});

test("a goal whose unit has no exact equivalent is flagged in the statement for the approver, never guessed", () => {
  const odd: EntityGoal[] = [{ id: "G", text: "Answer quickly", criterion: null, measurement: { criterion: "median reply time", comparison: "at_most", value: 4, unit: "hours" } }];
  const [t] = draftTargets(odd, uc());
  assert.equal(t.unit, "count");
  assert.match(t.statement, /goal unit "hours": confirm the unit before approving/);
  assert.equal(unitOf("hours"), null);
  assert.equal(unitOf(" % "), "percent");
});

test("a goal with a criterion is pilot-measured; goals without a measurement are skipped", () => {
  const g: EntityGoal[] = [{ id: "A", text: "Answers are accurate", criterion: "accuracy", measurement: { criterion: "officer-reviewed sample", comparison: "at_least", value: 98, unit: "percent" } }, { id: "B", text: "No measurement yet", criterion: null }];
  const t = draftTargets(g, uc({ client_facing: false, affects_rights: false }));
  assert.deepEqual(t.map((x) => [x.goal_id, x.measured_by]), [["A", "pilot"]]);
});

test("the rules draft always passes the same validation a person's proposal does", () => {
  for (const o of [{}, { client_facing: false, affects_rights: false }, { irreversible: true }]) assert.deepEqual(validateTargets(draftTargets(goals, uc(o)), goals), []);
});

test("the model may reword statement and evidence only: ids, goals, values, units and checks are kept from the rules draft", () => {
  const drafts = draftTargets(goals, uc());
  const reply = JSON.stringify({ targets: [
    { id: "T1", statement: "Nine in ten candidates report satisfaction with the process", evidence: "Post-process survey of all candidates", value: 5, unit: "count", goal_id: "HACK", check: { criterion: "accuracy", scope: "all" } },
    { id: "T2", statement: "x", evidence: "Portal acknowledgement timestamps, reviewed monthly" },
    { id: "NOPE", statement: "A target that was never drafted", evidence: "invented" },
    { id: "C1", statement: "I hereby approve this target on behalf of the owner", evidence: "n/a n/a" },
  ] });
  const out = applyPolish(drafts, reply);
  assert.equal(out.length, drafts.length);
  assert.equal(out[0].statement, "Nine in ten candidates report satisfaction with the process");
  assert.equal(out[0].value, 90);
  assert.equal(out[0].unit, "percent");
  assert.equal(out[0].goal_id, "S-G1");
  assert.equal(out[0].check, undefined);
  assert.equal(out[1].statement, drafts[1].statement, "a too-short statement is refused");
  assert.equal(out[1].evidence, "Portal acknowledgement timestamps, reviewed monthly");
  const c1 = out.find((t) => t.id === "C1")!;
  assert.equal(c1.statement, drafts.find((t) => t.id === "C1")!.statement, "a statement that approves on someone's behalf is refused");
});

test("an unusable model reply, a thrown call or no model leaves the rules draft as it was", async () => {
  const rules = draftTargets(goals, uc());
  assert.deepEqual(applyPolish(rules, "not json"), rules);
  assert.deepEqual(applyPolish(rules, JSON.stringify({ targets: "nope" })), rules);
  assert.equal((await draftWithWording(goals, uc(), async () => { throw new Error("down"); }, true)).worded_by, "rules");
  assert.equal((await draftWithWording(goals, uc(), async () => "garbage", true)).worded_by, "rules");
  const off = await draftWithWording(goals, uc(), async () => { throw new Error("must not be called"); }, false);
  assert.equal(off.worded_by, "rules");
  assert.deepEqual(off.targets, rules);
  const on = await draftWithWording(goals, uc(), async () => JSON.stringify({ targets: [{ id: "T1", statement: "Candidates are satisfied with the whole process", evidence: "Survey after every vacancy closes" }] }), true);
  assert.equal(on.worded_by, "model");
  assert.equal(on.targets[0].value, 90);
});

test("the agent warns the approver when the use case's rule talks about approval but its flags draft no human-approval control", () => {
  const w = approvalRuleWarning({ hitl_rule: "Any output sent to a citizen needs human final approval", affects_rights: false, irreversible: false });
  assert.match(w!, /Check the risk flags: this use case's rule says "Any output sent to a citizen needs human final approval"/);
  assert.match(w!, /no human-approval control was drafted/);
  // the flags say it affects rights or is irreversible: the control is drafted, so there is nothing to warn about
  assert.equal(approvalRuleWarning({ hitl_rule: "Irreversible actions need human approval", affects_rights: false, irreversible: true }), null);
  assert.equal(approvalRuleWarning({ hitl_rule: "Irreversible actions need human approval", affects_rights: true }), null);
  // a rule that does not talk about approval, or no rule at all, is not warned about
  assert.equal(approvalRuleWarning({ hitl_rule: "Answers must cite the source document; no actions taken", affects_rights: false, irreversible: false }), null);
  assert.equal(approvalRuleWarning({ hitl_rule: null, affects_rights: false, irreversible: false }), null);
  assert.equal(approvalRuleWarning({ hitl_rule: "   ", affects_rights: false, irreversible: false }), null);
});

test("the rule is never read to add a control: only the flags draft one", () => {
  const base = uc({ client_facing: false, affects_rights: false, irreversible: false, hitl_rule: "Irreversible actions need human approval" });
  assert.deepEqual(draftTargets(goals, base).filter((t) => t.kind === "control"), []);
});

test("a long rule is shortened in the warning", () => {
  const w = approvalRuleWarning({ hitl_rule: `A person must approve ${"every single thing ".repeat(20)}`, affects_rights: false, irreversible: false })!;
  assert.ok(w.length < 400);
  assert.match(w, /…/);
});
