import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { appendReview, goalSetOf, replayReviews, type GoalJudgment, type ReviewEntry } from "../src/lib/un/goal-judge.ts";
import type { EntityGoal } from "../src/lib/un/goals.ts";
import { can, type Subject } from "../src/lib/un/authz.ts";
import type { PilotRun } from "../src/lib/un/pilot.ts";
import type { Blueprint } from "../src/lib/un/test-derive.ts";
import { assembleDrill, parseSummary, type DrillInput } from "../src/lib/un/test-drilldown.ts";

const GOALS: EntityGoal[] = [{ id: "G1", text: "Answer correctly", criterion: "accuracy" }, { id: "G2", text: "Never invent a fee", criterion: "hallucination" }];
const TID = "T04.happy#t04-active";
const BP: Blueprint = { id: "T04.happy", slot: "T04.happy", family: "happy_path", task: "T04", title: "Verify an active licence", source: ["SOP-LIC-014#T04", "SOP-LIC-014#STEP-2"], derived: true, status: "active", expect: [{ kind: "exact", text: "Status is active" }] };
const CHUNKS = [{ chunk_id: "SOP-LIC-014#T04", text: "T04 Check the licence" }, { chunk_id: "SOP-LIC-014#STEP-2", text: "Step 2 look it up" }, { chunk_id: "SOP-LIC-014#R6", text: "R6 never waive" }];
const SUMMARY = JSON.stringify({ ok: true, output: { status: "active" }, refused: null, escalate: null, citations: ["SOP-LIC-014#T04", "SOP-LIC-014#R6"] });
const run = (rep: number, extra: Partial<PilotRun> = {}): PilotRun => ({
  test_id: TID, family: "happy_path", task: "T04", rep, passed: true, answer: `dig${rep}`, summary: SUMMARY, latency_ms: 10 * rep, cost: null, hallucinated: false, controls_ok: true, goals_ok: null,
  refusal_expected: false, refused: null, logged: true, rejected_calls: 0, client_facing: false, compliance_ok: null, disclosed: null, promotion_free: null, fee_ok: null, ...extra,
});
const J: GoalJudgment[] = [{ test_id: TID, met: false, goals: [{ id: "G1", met: true, reason: "right" }, { id: "G2", met: false, reason: "quoted a fee" }], reason: "fee problem" }];
const chain = (payload: Record<string, unknown>, ...more: [Parameters<typeof appendReview>[1], Record<string, unknown>][]): ReviewEntry[] => {
  const out = [appendReview(null, "judged", "u", payload, "2026-11-22T10:00:00.000Z")];
  for (const [k, p] of more) out.push(appendReview(out.at(-1)!, k, "u", p, "2026-11-22T10:05:00.000Z"));
  return out;
};
const newJudged = { pilot_id: "P1", model: "judge-m", judgments: J, goal_set: goalSetOf(GOALS), by: "u" };
const oldJudged = { pilot_id: "P1", model: "judge-m", judgments: J, by: "u" };
const approved = { pilot_id: "P1", approver: "Head of Licensing", approver_source: "process_owner", overrides: [{ test_id: TID, met: true, reason: "the fee was quoted from the table" }], hash: "h".repeat(64), by: "u2" };

const base = (review: ReturnType<typeof replayReviews>["reviews"][string] | null, runs = [run(1), run(2)]): DrillInput => ({
  testId: TID, review, runs, goalsNow: GOALS, blueprints: [BP], chunks: CHUNKS,
  pilot: { id: "P1", at: "2026-11-22T09:00:00.000Z", actor: "a", reps: 2, plan: { bound: { "T04.happy": ["t04-active"] } }, test_set_hash: "ts1", params_hash: "pp1" },
  current: { test_set_hash: "ts1", params_hash: "pp2" },
});
const drill = (i: DrillInput) => { const d = assembleDrill(i); assert.equal(d.ok, true); return d as Extract<typeof d, { ok: true }>; };

test("drill-down, no review yet: chain is complete, goals are the current ones and flagged unrecorded, nothing is judged", () => {
  const d = drill(base(null));
  assert.equal(d.assessment.status, "not_judged");
  assert.equal(d.assessment.effective, null);
  assert.equal(d.goal_set.recorded, false);
  assert.deepEqual(d.goal_set.goals, GOALS);
  assert.deepEqual(d.sop.source.map((l) => [l.id, l.text]), [["SOP-LIC-014#T04", "T04 Check the licence"], ["SOP-LIC-014#STEP-2", "Step 2 look it up"]]);
  assert.deepEqual(d.sop.cited.map((l) => [l.id, l.in_source, l.text]), [["SOP-LIC-014#T04", true, "T04 Check the licence"], ["SOP-LIC-014#R6", false, "R6 never waive"]]);
  assert.deepEqual([d.test.blueprint_id, d.test.case_id, d.test.family, d.test.bound_cases, d.test.expect], ["T04.happy", "t04-active", "happy_path", ["t04-active"], ["Status is active"]]);
  assert.deepEqual(d.reps.map((r) => [r.rep, r.answer, r.latency_ms, r.parsed?.ok]), [[1, "dig1", 10, true], [2, "dig2", 20, true]]);
  assert.deepEqual(d.hashes, { test_set: "ts1", params: "pp1", test_set_unchanged: true, params_unchanged: false });
});

test("drill-down, judged but not approved: the model's per-goal reasons show, nothing is in force beyond the model", () => {
  const d = drill(base(replayReviews(chain(newJudged)).reviews.P1));
  assert.equal(d.assessment.status, "judged");
  assert.equal(d.assessment.model, "judge-m");
  assert.equal(d.assessment.judgment?.goals[1].reason, "quoted a fee");
  assert.equal(d.assessment.approval, null);
  assert.equal(d.assessment.effective, false);
  assert.equal(d.goal_set.recorded, true);
});

test("drill-down, approved with an override: approver, hash, the override and its reason; the override is the judgment in force", () => {
  const d = drill(base(replayReviews(chain(newJudged, ["approved", approved])).reviews.P1));
  assert.equal(d.assessment.status, "approved");
  assert.equal(d.assessment.approval?.approver, "Head of Licensing");
  assert.equal(d.assessment.approval?.hash, "h".repeat(64));
  assert.deepEqual(d.assessment.override, { test_id: TID, met: true, reason: "the fee was quoted from the table" });
  assert.equal(d.assessment.judgment?.met, false, "the model's own judgment is still shown");
  assert.equal(d.assessment.effective, true);
});

test("drill-down, older review without a goal set: the current goals are shown and marked not recorded; the rest still works", () => {
  const d = drill(base(replayReviews(chain(oldJudged, ["approved", { ...approved, overrides: [] }])).reviews.P1));
  assert.equal(d.goal_set.recorded, false);
  assert.deepEqual(d.goal_set.goals, GOALS);
  assert.equal(d.goal_set.hash, goalSetOf(GOALS).hash);
  assert.equal(d.assessment.status, "approved");
  assert.equal(d.assessment.override, null);
  assert.equal(d.assessment.effective, false);
});

test("drill-down, a recorded goal set wins over the current wording even after goals change", () => {
  const changed = base(replayReviews(chain(newJudged)).reviews.P1);
  changed.goalsNow = [{ ...GOALS[0], text: "Reworded later" }];
  const d = drill(changed);
  assert.equal(d.goal_set.goals[0].text, "Answer correctly");
});

test("drill-down, a refused and an escalated output are shown as such", () => {
  const refused = JSON.stringify({ ok: false, output: { status: "outside_kb" }, refused: "no source covers this", escalate: "licensing officer", citations: [] });
  const d = drill(base(null, [run(1, { summary: refused, refused: true, refusal_expected: true, passed: true })]));
  assert.equal(d.reps[0].parsed?.ok, false);
  assert.equal(d.reps[0].parsed?.refused, "no source covers this");
  assert.equal(d.reps[0].parsed?.escalate, "licensing officer");
  assert.equal(d.reps[0].det.refused, true);
  assert.equal(d.reps[0].det.refusal_expected, true);
  assert.deepEqual(d.sop.cited, []);
});

test("drill-down, a test id that does not exist is an error, not an empty chain", () => {
  const r = assembleDrill({ ...base(null), testId: "T99.none#nothing" });
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /T99\.none#nothing/);
});

test("drill-down, a test no longer in the test set, a run with no stored output, and a chunk missing from the KB", () => {
  const d = drill({ ...base(null, [run(1, { summary: undefined })]), blueprints: [], chunks: [] });
  assert.equal(d.test.found, false);
  assert.equal(d.test.title, null);
  assert.equal(d.reps[0].parsed, null);
  assert.deepEqual(d.sop.source, []);
  const e = drill({ ...base(null), chunks: [] });
  assert.equal(e.sop.source[0].text, null, "unresolved lines are marked, not dropped");
});

test("summary parsing: a summary cut at 900 characters is read as far as it goes and says it was cut", () => {
  const long = JSON.stringify({ ok: true, output: { text: "x".repeat(2000) }, refused: null, escalate: null, citations: ["SOP-LIC-014#T04"] }).slice(0, 900);
  const p = parseSummary(long)!;
  assert.equal(p.truncated, true);
  assert.equal(p.ok, true);
  assert.equal(p.citations.length, 0);
  assert.equal(parseSummary(undefined), null);
  assert.equal(parseSummary(SUMMARY)?.truncated, false);
});

test("the page needs only 'view' (a viewer sees everything), asks for no other permission, and the link sits in the pilot screen", () => {
  const viewer: Subject = { legacyRole: "viewer", assignments: [{ role: "viewer", scope: { kind: "org" } }] };
  assert.equal(can(viewer, "view").ok, true);
  const page = readFileSync("src/app/admin/federal/use-cases/[id]/pilot/test/page.tsx", "utf8");
  assert.ok(!/permissionsFor|requirePermission|\.can\(/.test(page), "the drill-down checks no permission beyond being signed in with an organisation");
  assert.match(page, /force-dynamic/);
  assert.match(readFileSync("src/app/admin/federal/use-cases/[id]/pilot/GoalReview.tsx", "utf8"), /pilot\/test\?profile=/);
  assert.match(readFileSync("src/app/admin/federal/use-cases/[id]/pilot/page.tsx", "utf8"), /pilot\/test\?profile=/);
});
