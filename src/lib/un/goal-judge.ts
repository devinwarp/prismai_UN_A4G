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

export const GOAL_SYSTEM = `You judge whether the output of an AI agent meets the acceptance checks of the process it works in. You are shown the checks, one test, what the test expects, the SOP passages the agent cited (when it cited any) and what the agent produced. For EACH check say whether this output meets it (use the check's id in the reply).
Judge ONLY the checks listed. What the test expects is background about what the test is for: never fail a check because the output differs from the test's expected text, and never add a requirement the check does not state.
A check that forbids something ("never", "no") is met whenever the output does not do it: an output that quotes no fee meets a check about the fees it quotes, and an output that sends no message meets a check about messages. A check that requires something of a message (a disclosure, an officer's release) applies only to an output that contains a message. A figure that follows from a cited passage (for example a base fee plus the late fee the table states) follows from it. Fail a check only when the output itself shows the violation, or lacks what the check requires of what the output contains. Do not reward length or tone.
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

/** A passage of the SOP the agent cited, shown to the judge so it can check a figure or a claim against the source. */
export interface Evidence { chunk_id: string; text: string }

export interface JudgeInput { test_id: string; title: string; expect: string[]; summary: string; /** the SOP passages the run cited (at most MAX_EVIDENCE) */ evidence?: Evidence[]; /** The agent writes to a citizen in this test. */ client_facing?: boolean }

/** The checks asked of one test: a check scoped to client-facing tests is asked only of those. */
export const checksFor = (goals: EntityGoal[], t: Pick<JudgeInput, "client_facing">): EntityGoal[] => goals.filter((g) => g.scope !== "client_facing" || t.client_facing === true);

export const MAX_EVIDENCE = 3;
const EVIDENCE_CHARS = 700;

export function userPrompt(goals: EntityGoal[], t: JudgeInput): string {
  const ev = (t.evidence ?? []).slice(0, MAX_EVIDENCE);
  const cited = ev.length ? `\n\nThe SOP passages the agent cited, word for word (check every figure and claim against them; the published fee table is among them when it was cited):\n${ev.map((e) => `[${e.chunk_id}] ${e.text.replace(/\s+/g, " ").slice(0, EVIDENCE_CHARS)}`).join("\n")}` : "";
  return `Checks of the process:\n${goals.map((g) => `- ${g.id}: ${g.text}`).join("\n")}\n\nTest: ${t.title}\nWhat the test expects:\n${t.expect.map((e) => `- ${e}`).join("\n")}\n\nWhat the agent produced:\n${t.summary}${cited}`;
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
export async function judgeTests(chat: ChatFn, goals: EntityGoal[], all: JudgeInput[]): Promise<GoalJudgment[]> {
  // a test none of the checks applies to is not judged at all: it must not count as met, and it is not "unjudged" either
  const tests = all.filter((t) => checksFor(goals, t).length > 0);
  const out: GoalJudgment[] = new Array(tests.length);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < tests.length; i = next++) {
      const t = tests[i];
      const asked = checksFor(goals, t);
      try {
        // a reply that cannot be read (cut off, or wrapped in prose) is asked for once more; if it still cannot be read the test stays unjudged
        let j = parseJudgment(t.test_id, asked, await chat({ system: GOAL_SYSTEM, user: userPrompt(asked, t) }));
        if (j.met === null && /could not be read|no goals/.test(j.reason)) j = parseJudgment(t.test_id, asked, await chat({ system: GOAL_SYSTEM, user: `${userPrompt(asked, t)}

Your last reply could not be read. Reply with the one JSON object only, with one short sentence per reason.` }));
        out[i] = j;
      }
      catch (e) { out[i] = { test_id: t.test_id, met: null, goals: [], reason: `the model call failed: ${e instanceof Error ? e.message.slice(0, 120) : "error"}` }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(JUDGE_CONCURRENCY, tests.length) }, worker));
  return out;
}

/** The passages a run cited, read from its summary (the ids are in it, ahead of the output): the first few that exist in the SOP. */
export function citedPassages(summary: string | undefined, passages: Map<string, string>): Evidence[] {
  let ids: unknown;
  try { ids = (JSON.parse(summary ?? "{}") as { citations?: unknown }).citations; } catch { ids = (summary ?? "").match(/SOP-[A-Z0-9-]+#[A-Za-z0-9.-]+/g); }
  const list = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
  return [...new Set(list)].filter((id) => passages.has(id)).slice(0, MAX_EVIDENCE).map((id) => ({ chunk_id: id, text: passages.get(id)! }));
}

/** One test per distinct test_id, with the first run's summary. */
export function testsToJudge(runs: PilotRun[], titles: Record<string, { title: string; expect: string[] }>, passages?: Map<string, string>): JudgeInput[] {
  const seen = new Map<string, PilotRun>();
  for (const r of runs) if (!r.generated && !seen.has(r.test_id)) seen.set(r.test_id, r);
  return [...seen.values()].map((r) => {
    const bp = titles[r.test_id.split("#")[0]];
    return { test_id: r.test_id, title: bp?.title ?? r.test_id, expect: bp?.expect ?? [], summary: r.summary ?? "(no output recorded)", client_facing: r.client_facing && r.disclosed !== null, ...(passages ? { evidence: citedPassages(r.summary, passages) } : {}) };
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
