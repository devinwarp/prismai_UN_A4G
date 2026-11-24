import assert from "node:assert/strict";
import test from "node:test";
import { applyGoals, appendReview, effective, goalSetHash, goalSetOf, JUDGE_CONCURRENCY, judgeTests, parseJudgment, planReview, replayReviews, reviewHash, testsToJudge, verifyReviews, type ChatFn, type GoalJudgment, type ReviewEntry } from "../src/lib/un/goal-judge.ts";
import type { EntityGoal } from "../src/lib/un/goals.ts";
import type { PilotRun } from "../src/lib/un/pilot.ts";

const GOALS: EntityGoal[] = [{ id: "G1", text: "Answer correctly the first time", criterion: "accuracy" }, { id: "G2", text: "Keep citizens' data inside the entity", criterion: "accuracy" }];
const reply = (g1: boolean, g2: boolean) => JSON.stringify({ goals: [{ id: "G1", met: g1, reason: "r1" }, { id: "G2", met: g2, reason: "r2" }], reason: "overall" });
const run = (test_id: string, rep: number, extra: Partial<PilotRun> = {}): PilotRun => ({
  test_id, family: "happy_path", task: "T04", rep, passed: true, answer: "a", summary: `{"ok":true,"id":"${test_id}"}`, latency_ms: 5, cost: null, hallucinated: false, controls_ok: true, goals_ok: null,
  refusal_expected: false, refused: null, logged: true, rejected_calls: 0, client_facing: false, compliance_ok: null, disclosed: null, promotion_free: null, fee_ok: null, ...extra,
});

test("parse: every goal judged gives met/not met; a missing goal, bad JSON or no goals is unjudged, never a pass", () => {
  assert.equal(parseJudgment("t", GOALS, reply(true, true)).met, true);
  assert.equal(parseJudgment("t", GOALS, reply(true, false)).met, false);
  assert.equal(parseJudgment("t", GOALS, JSON.stringify({ goals: [{ id: "G1", met: true, reason: "" }] })).met, null, "G2 was not judged");
  assert.equal(parseJudgment("t", GOALS, "not json at all").met, null);
  assert.equal(parseJudgment("t", GOALS, JSON.stringify({ goals: [{ id: "G1", met: "yes" }, { id: "G2", met: true }] })).met, null, "met must be a boolean");
  assert.equal(parseJudgment("t", GOALS, "```json\n" + reply(true, true) + "\n```").met, true, "a fenced reply is read");
});

test("judge: one call per test; a failed call is unjudged and does not stop the others", async () => {
  let n = 0;
  const chat: ChatFn = async () => { n++; if (n === 2) throw new Error("timeout"); return reply(true, true); };
  const out = await judgeTests(chat, GOALS, [{ test_id: "a", title: "A", expect: ["x"], summary: "s" }, { test_id: "b", title: "B", expect: [], summary: "s" }, { test_id: "c", title: "C", expect: [], summary: "s" }]);
  assert.deepEqual(out.map((j) => j.met), [true, null, true]);
  assert.match(out[1].reason, /timeout/);
});

test("judge: calls run a few at a time (a pilot has hundreds of tests) and results keep the tests' order", async () => {
  let live = 0, peak = 0;
  const chat: ChatFn = async ({ user }) => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 5)); live--; return user.includes("Test: T3") ? "nope" : reply(true, true); };
  const tests = Array.from({ length: 40 }, (_, i) => ({ test_id: `t${i}`, title: `T${i}`, expect: [], summary: "s" }));
  const out = await judgeTests(chat, GOALS, tests);
  assert.deepEqual(out.map((j) => j.test_id), tests.map((t) => t.test_id));
  assert.equal(out[3].met, null);
  assert.ok(peak > 1 && peak <= JUDGE_CONCURRENCY, `peak ${peak}`);
});

test("tests to judge: one per distinct test, with the first run's output and the blueprint's wording", () => {
  const t = testsToJudge([run("bp1#c1", 1), run("bp1#c1", 2), run("bp2#c2", 1)], { bp1: { title: "Normal case", expect: ["Produces X"] } });
  assert.equal(t.length, 2);
  assert.deepEqual(t[0], { test_id: "bp1#c1", title: "Normal case", expect: ["Produces X"], summary: '{"ok":true,"id":"bp1#c1"}', client_facing: false });
  assert.equal(t[1].title, "bp2#c2");
});

const J: GoalJudgment[] = [
  { test_id: "t1", met: true, goals: [], reason: "" }, { test_id: "t2", met: false, goals: [], reason: "" }, { test_id: "t3", met: null, goals: [], reason: "unreadable" },
];
function chain(...steps: [Parameters<typeof appendReview>[1], Record<string, unknown>][]): ReviewEntry[] {
  const out: ReviewEntry[] = [];
  for (const [k, p] of steps) out.push(appendReview(out[out.length - 1] ?? null, k, "x", p, "2026-11-21T10:00:00.000Z"));
  return out;
}
const judged = (): ReviewEntry[] => chain(["judged", { pilot_id: "P1", model: "m", judgments: J, by: "u" }]);
const OWNER = { title: "Head of Licensing", source: "process_owner" };

test("nothing counts before a person approves: runs are returned unchanged", () => {
  const runs = [run("t1", 1), run("t2", 1)];
  const st = replayReviews(judged());
  assert.deepEqual(applyGoals(runs, st.reviews.P1).map((r) => r.goals_ok), [null, null]);
});

test("approval: judgments in force are the model's, except where the person overrode them with a reason", () => {
  let log = judged();
  const st = replayReviews(log);
  const p = planReview(st, { type: "approve", pilot_id: "P1", approver: OWNER, overrides: [{ test_id: "t2", met: true, reason: "The output serves G1 and G2; the model misread it" }, { test_id: "t3", met: false, reason: "Not judged; fails until shown" }] }, "u2");
  assert.equal(p.ok, true);
  if (!p.ok) return;
  log = [...log, appendReview(log[log.length - 1], p.kind, "u2", p.payload, "2026-11-21T10:05:00.000Z")];
  const r = replayReviews(log).reviews.P1;
  assert.deepEqual(effective(r), { t1: true, t2: true, t3: false });
  assert.equal(r.approved!.approver, "Head of Licensing");
  assert.equal(r.approved!.hash, reviewHash({ judgments: J, overrides: r.approved!.overrides }));
  const runs = applyGoals([run("t1", 1), run("t2", 1), run("t3", 1), run("t1", 2)], r);
  assert.deepEqual(runs.map((x) => x.goals_ok), [true, true, false, true]);
  assert.deepEqual(verifyReviews(log), { ok: true });
});

test("approval without overrides keeps an unjudged test unjudged (null), so it stays not measured", () => {
  const st = replayReviews(judged());
  const p = planReview(st, { type: "approve", pilot_id: "P1", approver: OWNER, overrides: [] }, "u2");
  assert.equal(p.ok, true);
  if (!p.ok) return;
  const log = [...judged(), appendReview(judged().at(-1)!, p.kind, "u2", p.payload, "2026-11-21T10:05:00.000Z")];
  assert.deepEqual(effective(replayReviews(log).reviews.P1), { t1: true, t2: false, t3: null });
});

test("rules: an override needs a reason and a known test; no double approval; withdraw needs a reason; judging again is blocked while approved", () => {
  const st = replayReviews(judged());
  const err = (overrides: { test_id: string; met: boolean; reason: string }[]) => { const p = planReview(st, { type: "approve", pilot_id: "P1", approver: OWNER, overrides }, "u"); return p.ok ? "" : p.error; };
  assert.match(err([{ test_id: "t2", met: true, reason: " " }]), /needs a reason/);
  assert.match(err([{ test_id: "zz", met: true, reason: "x" }]), /not one of the judged tests/);
  assert.match(err([{ test_id: "t2", met: true, reason: "x" }, { test_id: "t2", met: false, reason: "y" }]), /twice/);
  assert.equal(planReview(replayReviews([]), { type: "approve", pilot_id: "P9", approver: OWNER, overrides: [] }, "u").ok, false);

  const ap = planReview(st, { type: "approve", pilot_id: "P1", approver: OWNER, overrides: [] }, "u");
  if (!ap.ok) throw new Error("approve");
  const log = [...judged(), appendReview(judged().at(-1)!, ap.kind, "u", ap.payload, "2026-11-21T10:05:00.000Z")];
  const st2 = replayReviews(log);
  assert.match((planReview(st2, { type: "approve", pilot_id: "P1", approver: OWNER, overrides: [] }, "u") as { error: string }).error, /already approved/);
  assert.match((planReview(st2, { type: "judge", pilot_id: "P1", model: "m", judgments: J, goals: GOALS }, "u") as { error: string }).error, /withdraw/);
  assert.match((planReview(st2, { type: "withdraw", pilot_id: "P1", reason: " " }, "u") as { error: string }).error, /reason/);
  const wd = planReview(st2, { type: "withdraw", pilot_id: "P1", reason: "model was wrong about T2" }, "u");
  assert.equal(wd.ok, true);
  if (!wd.ok) return;
  const st3 = replayReviews([...log, appendReview(log.at(-1)!, wd.kind, "u", wd.payload, "2026-11-21T10:06:00.000Z")]);
  assert.equal(st3.reviews.P1.approved, null);
  assert.deepEqual(applyGoals([run("t1", 1)], st3.reviews.P1).map((r) => r.goals_ok), [null]);
});

test("the log detects a changed judgment", () => {
  const log = judged();
  const forged = [{ ...log[0], payload: { ...log[0].payload, judgments: [{ test_id: "t1", met: true, goals: [], reason: "edited" }] } }];
  assert.equal(verifyReviews(forged).ok, false);
});

// ---- the goal set recorded with each judgment --------------------------------------------------

test("a new judged entry records the goal set (id, text, criterion) and its hash; replay returns it", () => {
  const p = planReview(replayReviews([]), { type: "judge", pilot_id: "P1", model: "m", judgments: J, goals: GOALS }, "u");
  if (!p.ok) throw new Error("judge");
  const log = [appendReview(null, p.kind, "u", p.payload, "2026-11-22T10:00:00.000Z")];
  const gs = replayReviews(log).reviews.P1.goal_set!;
  assert.deepEqual(gs.goals, GOALS);
  assert.equal(gs.hash, goalSetHash(GOALS));
  assert.match(gs.hash, /^[0-9a-f]{64}$/);
  assert.notEqual(goalSetHash([{ ...GOALS[0], text: "changed" }, GOALS[1]]), gs.hash, "any wording change changes the hash");
  assert.equal(verifyReviews(log).ok, true);
  const forged = [{ ...log[0], payload: { ...log[0].payload, goal_set: goalSetOf([{ ...GOALS[0], text: "other" }]) } }];
  assert.equal(verifyReviews(forged).ok, false, "the goal set is inside the chain");
});

test("old entries without a goal set still replay and verify, alone and mixed with new ones", () => {
  const old = judged(); // written before goal sets existed
  assert.equal(replayReviews(old).reviews.P1.goal_set, null);
  assert.equal(verifyReviews(old).ok, true);
  const ap = planReview(replayReviews(old), { type: "approve", pilot_id: "P1", approver: OWNER, overrides: [] }, "u");
  if (!ap.ok) throw new Error("approve");
  const mid = [...old, appendReview(old[0], ap.kind, "u", ap.payload, "2026-11-22T10:05:00.000Z")];
  const nj = planReview(replayReviews(mid), { type: "judge", pilot_id: "P2", model: "m", judgments: J, goals: GOALS }, "u");
  if (!nj.ok) throw new Error("judge2");
  const mixed = [...mid, appendReview(mid[1], nj.kind, "u", nj.payload, "2026-11-22T10:10:00.000Z")];
  assert.equal(verifyReviews(mixed).ok, true);
  const st = replayReviews(mixed);
  assert.equal(st.reviews.P1.goal_set, null);
  assert.equal(st.reviews.P1.approved?.hash, reviewHash({ judgments: J, overrides: [] }), "the approval hash is unchanged by goal sets");
  assert.equal(st.reviews.P2.goal_set?.hash, goalSetHash(GOALS));
});

test("the same chain passes through a database round trip (jsonb reorders keys) with and without a goal set", () => {
  const p = planReview(replayReviews([]), { type: "judge", pilot_id: "P1", model: "m", judgments: J, goals: GOALS }, "u");
  if (!p.ok) throw new Error("judge");
  const old = judged()[0];
  const chained = [old, appendReview(old, "judged", "u", p.payload, "2026-11-22T10:00:00.000Z")];
  const reordered = JSON.parse(JSON.stringify(chained, (_, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v))) as ReviewEntry[];
  assert.equal(verifyReviews(reordered).ok, true);
});

test("a check scoped to client-facing tests is asked only of those, and a test with no applicable check is not judged", async () => {
  const checks = [{ id: "C1", text: "fee only from the table", criterion: "hallucination" as const, scope: "all" as const }, { id: "C2", text: "officer releases", criterion: "human_final_approval" as const, scope: "client_facing" as const }];
  const asked: string[][] = [];
  const chat = async ({ user }: { system: string; user: string }) => { const ids = [...user.matchAll(/- (C\d):/g)].map((m) => m[1]); asked.push(ids); return JSON.stringify({ goals: ids.map((id) => ({ id, met: true, reason: "ok" })), reason: "ok" }); };
  const tests = [{ test_id: "internal", title: "a", expect: [], summary: "{}", client_facing: false }, { test_id: "cf", title: "b", expect: [], summary: "{}", client_facing: true }];
  const out = await judgeTests(chat, checks, tests);
  assert.deepEqual(out.map((j) => [j.test_id, j.goals.map((g) => g.id)]), [["internal", ["C1"]], ["cf", ["C1", "C2"]]]);
  const only = await judgeTests(chat, [checks[1]], tests);
  assert.deepEqual(only.map((j) => j.test_id), ["cf"]);
});

test("the judge is shown the SOP passages a run cited, at most three, so it can check a figure against the source", async () => {
  const { citedPassages, userPrompt, MAX_EVIDENCE } = await import("../src/lib/un/goal-judge.ts");
  const passages = new Map([["SOP-LIC-014#S6", "| Group | Base |\n| Food | 2,000 |"], ["SOP-LIC-014#T12", "Send the fee notice."], ["SOP-LIC-014#D1", "d1"], ["SOP-LIC-014#D2", "d2"]]);
  const summary = JSON.stringify({ ok: true, citations: ["SOP-LIC-014#S6", "SOP-LIC-014#NOPE", "SOP-LIC-014#T12", "SOP-LIC-014#S6", "SOP-LIC-014#D1", "SOP-LIC-014#D2"], output: { total: 2200 } });
  const ev = citedPassages(summary, passages);
  assert.deepEqual(ev.map((e) => e.chunk_id), ["SOP-LIC-014#S6", "SOP-LIC-014#T12", "SOP-LIC-014#D1"], "known ids only, once each, at most three");
  assert.equal(MAX_EVIDENCE, 3);
  assert.deepEqual(citedPassages("not json but cites SOP-LIC-014#S6 here", passages).map((e) => e.chunk_id), ["SOP-LIC-014#S6"]);
  assert.deepEqual(citedPassages(undefined, passages), []);
  const p = userPrompt([{ id: "C1", text: "fee only from the table", criterion: "hallucination" }], { test_id: "t", title: "T", expect: [], summary, evidence: ev });
  assert.match(p, /The SOP passages the agent cited, word for word/);
  assert.match(p, /\[SOP-LIC-014#S6\] \| Group \| Base \| \| Food \| 2,000 \|/);
  assert.doesNotMatch(userPrompt([{ id: "C1", text: "x", criterion: "hallucination" }], { test_id: "t", title: "T", expect: [], summary }), /cited, word for word/);
});

test("testsToJudge attaches the cited passages only when it is given the SOP's passages", () => {
  const run = { test_id: "a#a", family: "happy_path", task: "T11", rep: 1, passed: true, answer: "a", summary: JSON.stringify({ citations: ["SOP-LIC-014#S6"] }), latency_ms: 1, cost: null, hallucinated: null, controls_ok: true, goals_ok: null, refusal_expected: false, refused: null, logged: true, rejected_calls: 0, client_facing: false, compliance_ok: null, disclosed: null, promotion_free: null, fee_ok: null } as never;
  assert.equal(testsToJudge([run], {})[0].evidence, undefined);
  assert.deepEqual(testsToJudge([run], {}, new Map([["SOP-LIC-014#S6", "table"]]))[0].evidence, [{ chunk_id: "SOP-LIC-014#S6", text: "table" }]);
});

test("an unreadable judge reply is asked for once more; one that stays unreadable is unjudged, never met", async () => {
  const checks = [{ id: "C1", text: "x", criterion: "hallucination" as const, scope: "all" as const }];
  const test1 = { test_id: "a", title: "A", expect: [], summary: "{}" };
  let n = 0;
  const flaky: ChatFn = async () => (n++ === 0 ? '{"goals":[{"id":"C1","met":tr' : JSON.stringify({ goals: [{ id: "C1", met: true, reason: "ok" }], reason: "ok" }));
  const [fixed] = await judgeTests(flaky, checks, [test1]);
  assert.equal(fixed.met, true);
  assert.equal(n, 2);
  let m = 0;
  const never: ChatFn = async () => { m++; return "I cannot say"; };
  const [still] = await judgeTests(never, checks, [test1]);
  assert.equal(still.met, null);
  assert.equal(m, 2, "asked twice, no more");
  let k = 0;
  const fine: ChatFn = async () => { k++; return JSON.stringify({ goals: [{ id: "C1", met: false, reason: "no" }], reason: "no" }); };
  const [bad] = await judgeTests(fine, checks, [test1]);
  assert.deepEqual([bad.met, k], [false, 1], "a readable reply is not asked for twice");
});

test("the judge prompt: only the listed checks, the test's expectation is background, a prohibition is met when it is not broken, no 'when in doubt not met'", async () => {
  const { GOAL_SYSTEM } = await import("../src/lib/un/goal-judge.ts");
  assert.match(GOAL_SYSTEM, /Judge ONLY the checks listed/);
  assert.match(GOAL_SYSTEM, /never fail a check because the output differs from the test's expected text/);
  assert.match(GOAL_SYSTEM, /forbids something .* is met whenever the output does not do it/);
  assert.match(GOAL_SYSTEM, /quotes no fee meets a check about the fees it quotes/);
  assert.match(GOAL_SYSTEM, /applies only to an output that contains a message/);
  assert.match(GOAL_SYSTEM, /base fee plus the late fee the table states\) follows from it/);
  assert.doesNotMatch(GOAL_SYSTEM, /when in doubt/i);
  assert.match(GOAL_SYSTEM, /Reply with one JSON object only/);
});
