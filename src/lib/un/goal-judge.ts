import { createHash } from "node:crypto";
import { parseLlmJson } from "../llm.ts";
import type { PilotRun } from "./pilot.ts";
import { appendEntry, canon, verifyChain, type ChainEntry } from "./tuning.ts";
import { parseGoals, type EntityGoal } from "./goals.ts";

// Goal alignment of a pilot, judged first by a model and approved by a person.
//
//  1. The model reads, for each test, the entity's goals, what the test expects and what the agent produced, and
//     says per goal whether the output serves it, with a reason. A failed call or an unreadable reply is "unjudged"
//     (met: null): it never defaults to a pass.
//  2. Nothing counts until a person approves. The person sees every judgment, may override any of them (a reason is
//     required), and approves as an approver chosen from the use case's list. Only approved judgments set
//     `goals_ok` on the runs; before that the measure reads "not measured" and the gate stays unmet.
//  3. Judgments, overrides and approvals are one hash-chained log, so what the model said and what the person
//     changed are both on record.

export type ChatFn = (o: { system: string; user: string }) => Promise<string>;

export const GOAL_SYSTEM = `You judge whether the output of an AI agent serves the goals of the government entity that runs it. You are shown the entity's goals, one test, what the test expects, and what the agent produced. For EACH goal say whether this output serves it. An output serves a goal only if the output itself shows it; if the output is silent on a goal that the test could not have touched, the goal is met only when nothing in the output works against it. Do not reward length or tone. Be strict: when in doubt, say it is not met and say why.
Reply with one JSON object only, in exactly this shape:
{"goals": [{"id": "<goal id>", "met": true, "reason": "<one sentence>"}], "reason": "<one sentence overall>"}`;

export interface GoalVerdict { id: string; met: boolean; reason: string }
export interface GoalJudgment {
  test_id: string;
  /** All goals met: true; some not met: false; the model could not judge: null. */
  met: boolean | null;
  goals: GoalVerdict[];
  reason: string;
}

export interface JudgeInput { test_id: string; title: string; expect: string[]; summary: string }

export function userPrompt(goals: EntityGoal[], t: JudgeInput): string {
  return `Goals of the entity:\n${goals.map((g) => `- ${g.id}: ${g.text}`).join("\n")}\n\nTest: ${t.title}\nWhat the test expects:\n${t.expect.map((e) => `- ${e}`).join("\n")}\n\nWhat the agent produced:\n${t.summary}`;
}

/** Parse the model's reply against the goals asked about. Anything missing or malformed is "unjudged". */
export function parseJudgment(test_id: string, goals: EntityGoal[], reply: string): GoalJudgment {
  const unjudged = (reason: string): GoalJudgment => ({ test_id, met: null, goals: [], reason });
  let o: { goals?: unknown; reason?: unknown };
  try { o = parseLlmJson(reply) as typeof o; } catch { return unjudged("the model's reply could not be read"); }
  if (!o || !Array.isArray(o.goals)) return unjudged("the model's reply had no goals");
  const got = new Map<string, GoalVerdict>();
  for (const g of o.goals as Record<string, unknown>[]) {
    if (g && typeof g.id === "string" && typeof g.met === "boolean") got.set(g.id, { id: g.id, met: g.met, reason: typeof g.reason === "string" ? g.reason.slice(0, 300) : "" });
  }
  if (goals.some((g) => !got.has(g.id))) return unjudged("the model did not judge every goal");
  const list = goals.map((g) => got.get(g.id)!);
  return { test_id, met: list.every((g) => g.met), goals: list, reason: typeof o.reason === "string" ? o.reason.slice(0, 300) : "" };
}

/** One model call per test, a few at a time: a pilot has hundreds of tests, and one after the other would outlast a
 * hosted function (233 calls at ~2.6 s is ten minutes; eight at a time is about 75 s). Results keep the tests' order.
 * A thrown call is "unjudged", counted by the caller from `met === null`. */
export const JUDGE_CONCURRENCY = 8;
export async function judgeTests(chat: ChatFn, goals: EntityGoal[], tests: JudgeInput[]): Promise<GoalJudgment[]> {
  const out: GoalJudgment[] = new Array(tests.length);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < tests.length; i = next++) {
      const t = tests[i];
      try { out[i] = parseJudgment(t.test_id, goals, await chat({ system: GOAL_SYSTEM, user: userPrompt(goals, t) })); }
      catch (e) { out[i] = { test_id: t.test_id, met: null, goals: [], reason: `the model call failed: ${e instanceof Error ? e.message.slice(0, 120) : "error"}` }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(JUDGE_CONCURRENCY, tests.length) }, worker));
  return out;
}

/** One test per distinct test_id, with the first run's summary. */
export function testsToJudge(runs: PilotRun[], titles: Record<string, { title: string; expect: string[] }>): JudgeInput[] {
  const seen = new Map<string, PilotRun>();
  for (const r of runs) if (!seen.has(r.test_id)) seen.set(r.test_id, r);
  return [...seen.values()].map((r) => {
    const bp = titles[r.test_id.split("#")[0]];
    return { test_id: r.test_id, title: bp?.title ?? r.test_id, expect: bp?.expect ?? [], summary: r.summary ?? "(no output recorded)" };
  });
}

// ---- the review log ----------------------------------------------------------------------------

export type ReviewKind = "judged" | "approved" | "withdrawn";
export type ReviewEntry = ChainEntry<ReviewKind>;

/** The goals a review was judged against, kept in the entry itself so a review can always show what each goal said even
 * if ENTITY_GOALS changes later. `hash` is sha256 of the canonical goals. Entries written before this field existed
 * have none (`Review.goal_set` is null); they stay valid because the chain hashes whatever payload an entry has. */
export interface GoalSet { goals: EntityGoal[]; hash: string }
export const goalSetHash = (goals: EntityGoal[]): string => createHash("sha256").update(canon(goals)).digest("hex");
export const goalSetOf = (goals: EntityGoal[]): GoalSet => ({ goals, hash: goalSetHash(goals) });
const readGoalSet = (v: unknown): GoalSet | null => {
  const o = v as { goals?: unknown; hash?: unknown } | null;
  return o && typeof o === "object" && typeof o.hash === "string" && Array.isArray(o.goals) ? { goals: parseGoals(o.goals), hash: o.hash } : null;
};

export interface Override { test_id: string; met: boolean; reason: string }
export interface Review {
  pilot_id: string;
  model: string;
  judgments: GoalJudgment[];
  /** null for a review recorded before goal sets were kept. */
  goal_set: GoalSet | null;
  approved: { approver: string; approver_source: string; overrides: Override[]; hash: string; by: string; at: string } | null;
}
export interface ReviewState { reviews: Record<string, Review> }

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function replayReviews(entries: ReviewEntry[]): ReviewState {
  const reviews: Record<string, Review> = {};
  for (const e of entries) {
    const p = e.payload;
    const id = str(p.pilot_id);
    if (e.kind === "judged") reviews[id] = { pilot_id: id, model: str(p.model), judgments: p.judgments as GoalJudgment[], goal_set: readGoalSet(p.goal_set), approved: null };
    else if (e.kind === "approved" && reviews[id]) reviews[id].approved = { approver: str(p.approver), approver_source: str(p.approver_source), overrides: (p.overrides as Override[]) ?? [], hash: str(p.hash), by: str(p.by), at: e.at };
    else if (e.kind === "withdrawn" && reviews[id]) reviews[id].approved = null;
  }
  return { reviews };
}

/** The judgment in force for each test: the person's override, else the model's. */
export function effective(r: Review): Record<string, boolean | null> {
  const o = new Map((r.approved?.overrides ?? []).map((x) => [x.test_id, x.met]));
  return Object.fromEntries(r.judgments.map((j) => [j.test_id, o.has(j.test_id) ? o.get(j.test_id)! : j.met]));
}

export const reviewHash = (r: { judgments: GoalJudgment[]; overrides: Override[] }): string => createHash("sha256").update(canon({ j: r.judgments, o: [...r.overrides].sort((a, b) => a.test_id.localeCompare(b.test_id)) })).digest("hex");

export type ReviewAction =
  | { type: "judge"; pilot_id: string; model: string; judgments: GoalJudgment[]; goals: EntityGoal[] }
  | { type: "approve"; pilot_id: string; approver: { title: string; source: string }; overrides: Override[] }
  | { type: "withdraw"; pilot_id: string; reason: string };
export type ReviewPlan = { ok: true; kind: ReviewKind; payload: Record<string, unknown> } | { ok: false; error: string };

export function planReview(state: ReviewState, a: ReviewAction, by: string): ReviewPlan {
  const bad = (error: string): ReviewPlan => ({ ok: false, error });
  const r = state.reviews[a.pilot_id];
  if (a.type === "judge") {
    if (!a.judgments.length) return bad("Nothing to judge");
    if (r?.approved) return bad("These judgments are already approved; withdraw the approval before judging again");
    return { ok: true, kind: "judged", payload: { pilot_id: a.pilot_id, model: a.model, judgments: a.judgments, goal_set: goalSetOf(a.goals), by } };
  }
  if (!r) return bad("This pilot has no goal judgments yet");
  if (a.type === "withdraw") {
    if (!r.approved) return bad("There is no approval to withdraw");
    if (!a.reason.trim()) return bad("A reason is required to withdraw an approval");
    return { ok: true, kind: "withdrawn", payload: { pilot_id: a.pilot_id, reason: a.reason.trim(), by } };
  }
  if (r.approved) return bad("These judgments are already approved");
  const known = new Set(r.judgments.map((j) => j.test_id));
  const seen = new Set<string>();
  for (const o of a.overrides) {
    if (!known.has(o.test_id)) return bad(`${o.test_id} is not one of the judged tests`);
    if (seen.has(o.test_id)) return bad(`${o.test_id} is overridden twice`);
    seen.add(o.test_id);
    if (typeof o.met !== "boolean") return bad(`${o.test_id}: an override says met or not met`);
    if (!o.reason || !o.reason.trim()) return bad(`${o.test_id}: an override needs a reason`);
  }
  const overrides = a.overrides.map((o) => ({ test_id: o.test_id, met: o.met, reason: o.reason.trim().slice(0, 400) }));
  return { ok: true, kind: "approved", payload: { pilot_id: a.pilot_id, approver: a.approver.title, approver_source: a.approver.source, overrides, hash: reviewHash({ judgments: r.judgments, overrides }), by } };
}

export const appendReview = (prev: ReviewEntry | null, kind: ReviewKind, actor: string, payload: Record<string, unknown>, at: string): ReviewEntry => appendEntry<ReviewKind>(prev, kind, actor, payload, at);
export const verifyReviews = (entries: ReviewEntry[]) => verifyChain(entries);

/** Set `goals_ok` on the runs from the judgments in force. Only an approved review counts; before that the runs are
 * returned unchanged, so the measure stays "not measured". */
export function applyGoals(runs: PilotRun[], r: Review | undefined): PilotRun[] {
  if (!r?.approved) return runs;
  const eff = effective(r);
  return runs.map((x) => ({ ...x, goals_ok: eff[x.test_id] ?? null }));
}
