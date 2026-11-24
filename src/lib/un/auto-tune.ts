import type { UsageSnapshot } from "./cost.ts";
import type { Tally } from "./tuning-bank.ts";
import { appendEntry, verifyChain, type ChainEntry } from "./tuning.ts";
import type { Scores } from "./tuning-versions.ts";

// The tuning agent's rules: when it may change the agent by itself, and when a person decides. Pure: no I/O.
//
// What the user decided (see docs/un-auto-tune.md):
//  - It applies a fix by itself only while alignment on HELD-OUT cases is below a limit (default 95%); at or above it every proposal
//    waits for a person.
//  - Whatever the percentage, an edit that touches a control (officer release, AI disclosure, the fee table, refusal or authority
//    behaviour) or the wording of a client-facing message is propose-only. Auto-apply is for low-risk edits: a glossary term, a
//    retrieval route, a clarification to a non-client-facing instruction.
//  - Every auto-applied version must pass a no-regression test: nothing that was right becomes wrong, no control measure drops (the
//    "unsafe" counts do not rise), the held-out score does not fall. Otherwise it is discarded and never reaches the agent.
//  - The loop is bounded: cycles per day, candidates per cycle, model calls per day, and it stops after a few cycles that changed nothing.
//  - Only the process owner switches it off and on and sets the limit (within 90 to 98%). The floors stay in code.
// Nothing here approves a release: that is a person's signature, behind the release gate.

export const DEFAULT_THRESHOLD = 0.95;
export const THRESHOLD_RANGE = { min: 0.9, max: 0.98 } as const;
export const DEFAULT_BUDGET = { cyclesPerDay: 6, candidatesPerCycle: 12, iterationsPerCycle: 5, modelCallsPerDay: 60, stallCycles: 3 } as const;
export type Budget = { [K in keyof typeof DEFAULT_BUDGET]: number };

// ---- the settings and the record of cycles: a hash-chained log ------------------------------------------------------

export type AutoKind = "switched" | "threshold" | "started" | "finished";
export type AutoEntry = ChainEntry<AutoKind>;

export type StopReason = "no_misses" | "done" | "threshold_reached" | "budget" | "stalled" | "off" | "error";
export interface Change { id: string; summary: string; risk: "low" | "propose_only"; why: string; before: number | null; after: number | null }
export interface CycleRecord {
  at: string;
  by: string;
  /** auto: it may apply low-risk fixes; propose_only: it only proposes (switched off, or asked to) */
  mode: "auto" | "propose_only";
  held_out_before: number | null;
  held_out_after: number | null;
  applied: Change[];
  proposed: Change[];
  discarded: { summary: string; reason: string }[];
  stop: StopReason;
  model_calls: number;
  /** What the cycle used (model calls and tokens per model), for the cost ledger. */
  usage?: UsageSnapshot;
  error?: string;
}

export interface AutoState {
  enabled: boolean;
  threshold: number;
  switched_by: string | null;
  switched_at: string | null;
  /** a cycle that started and has not finished (and is not stale) */
  running: { since: string; by: string } | null;
  cycles: CycleRecord[];
}
export const EMPTY_AUTO: AutoState = { enabled: false, threshold: DEFAULT_THRESHOLD, switched_by: null, switched_at: null, running: null, cycles: [] };

/** A cycle that never reported back (a crash, a restart) stops counting as running after this long. */
export const STALE_MS = 15 * 60_000;

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function replayAuto(entries: AutoEntry[], now = Date.now()): AutoState {
  const s: AutoState = { ...EMPTY_AUTO, cycles: [] };
  for (const e of entries) {
    const p = e.payload;
    if (e.kind === "switched") { s.enabled = p.on === true; s.switched_by = str(p.by) || e.actor; s.switched_at = e.at; }
    else if (e.kind === "threshold" && typeof p.value === "number") s.threshold = p.value;
    else if (e.kind === "started") s.running = { since: e.at, by: str(p.by) || e.actor };
    else if (e.kind === "finished") { s.running = null; if (p.record && typeof p.record === "object") s.cycles.push(p.record as CycleRecord); }
  }
  if (s.running && now - Date.parse(s.running.since) > STALE_MS) s.running = null;
  return s;
}

export const verifyAuto = (entries: AutoEntry[]) => verifyChain(entries);
export const appendAuto = (prev: AutoEntry | null, kind: AutoKind, actor: string, payload: Record<string, unknown>, at: string): AutoEntry => appendEntry<AutoKind>(prev, kind, actor, payload, at);

export type AutoPlan = { ok: true; kind: AutoKind; payload: Record<string, unknown> } | { ok: false; error: string };
const bad = (error: string): AutoPlan => ({ ok: false, error });

export function planSwitch(state: AutoState, on: boolean, by: string): AutoPlan {
  if (state.enabled === on) return bad(`Auto-tuning is already ${on ? "on" : "off"}`);
  return { ok: true, kind: "switched", payload: { on, by } };
}

export function planThreshold(state: AutoState, value: unknown, by: string): AutoPlan {
  if (typeof value !== "number" || !Number.isFinite(value)) return bad("The limit must be a number");
  if (value < THRESHOLD_RANGE.min || value > THRESHOLD_RANGE.max) return bad(`The limit must be between ${THRESHOLD_RANGE.min * 100}% and ${THRESHOLD_RANGE.max * 100}%`);
  if (Math.abs(value - state.threshold) < 1e-9) return bad("That is already the limit");
  return { ok: true, kind: "threshold", payload: { value, by } };
}

const today = (at: string, now: number) => now - Date.parse(at) < 24 * 3600_000;
export const cyclesToday = (s: AutoState, now = Date.now()) => s.cycles.filter((c) => today(c.at, now)).length;
export const modelCallsToday = (s: AutoState, now = Date.now()) => s.cycles.filter((c) => today(c.at, now)).reduce((n, c) => n + c.model_calls, 0);

/** Several cycles in a row that changed nothing: the agent has run out of safe ideas, and the owner is told. */
export const stalled = (s: AutoState, n = DEFAULT_BUDGET.stallCycles): boolean => {
  const last = s.cycles.slice(-n);
  return last.length >= n && last.every((c) => c.applied.length === 0 && c.stop !== "no_misses" && c.stop !== "off");
};

/** May a cycle start now? */
export function planStart(s: AutoState, by: string, now = Date.now(), budget: Budget = DEFAULT_BUDGET): { ok: true; mode: CycleRecord["mode"]; payload: Record<string, unknown> } | { ok: false; error: string } {
  if (s.running) return { ok: false, error: "A tuning cycle is already running" };
  if (cyclesToday(s, now) >= budget.cyclesPerDay) return { ok: false, error: `The limit of ${budget.cyclesPerDay} tuning cycles a day is reached; it resets tomorrow` };
  const mode = s.enabled ? "auto" : "propose_only";
  return { ok: true, mode, payload: { by, mode } };
}

// ---- the policy -------------------------------------------------------------------------------------------------------

/** What an edit is, for risk: a glossary term, a retrieval route, a threshold setting, or a rule line of a job profile's skill. */
export interface Edit { kind: "glossary_add" | "glossary_remove" | "route_add" | "set" | "skill_line"; text: string; /** a skill line of a profile that writes to citizens */ client_facing?: boolean }

/** Words that mark an edit as touching a control or the wording of what a citizen reads. */
export const CONTROL_WORDS = /\b(release[sd]?|approv\w*|disclos\w*|ai assistant|fee table|refus\w*|authori[sz]\w*|waiv\w*|officer|human|person must|outside information|citizen|applicant)\b/i;

export function riskOf(e: Edit): { risk: "low" | "propose_only"; why: string } {
  if (e.kind === "set") return { risk: "propose_only", why: "it changes how strictly the agent decides a passage supports an answer" };
  if (CONTROL_WORDS.test(e.text)) return { risk: "propose_only", why: "it touches a control or what a citizen reads" };
  if (e.kind === "skill_line" && e.client_facing !== false) return { risk: "propose_only", why: "it is an instruction for a job profile that writes to citizens" };
  return { risk: "low", why: "a low-risk edit" };
}

const total = (t: Tally) => t.correct;
const tallies = (s: Scores): Tally[] => [s.questions.tune, s.questions.holdout, s.tasks.tune, s.tasks.holdout];

/** Alignment on the held-out cases (questions and task evals together), or null when there are none. */
export function heldOutAlignment(s: Scores): number | null {
  const n = s.questions.holdout.n + s.tasks.holdout.n;
  return n === 0 ? null : (s.questions.holdout.correct + s.tasks.holdout.correct) / n;
}

/** Why `after` is worse than `before`; empty means nothing got worse. Counts are what the scores hold, so this compares the number of
 * cases right and the number "unsafe" (an answer the SOP does not give, or a broken control) in each of the four groups. */
export function regressions(before: Scores, after: Scores): string[] {
  const names = ["tuning questions", "held-out questions", "tuning task evals", "held-out task evals"];
  const out: string[] = [];
  const b = tallies(before), a = tallies(after);
  b.forEach((x, i) => {
    if (total(a[i]) < total(x)) out.push(`${names[i]}: ${total(x)} right before, ${total(a[i])} after`);
    if (a[i].unsafe > x.unsafe) out.push(`${names[i]}: unsafe answers went from ${x.unsafe} to ${a[i].unsafe}`);
  });
  const hb = heldOutAlignment(before), ha = heldOutAlignment(after);
  if (hb !== null && ha !== null && ha + 1e-9 < hb) out.push("held-out alignment fell");
  return out;
}

export const improves = (before: Scores, after: Scores): boolean =>
  tallies(after).reduce((n, t) => n + total(t), 0) > tallies(before).reduce((n, t) => n + total(t), 0);

export type Decision = { action: "apply" | "propose" | "discard"; why: string };

/** The one place the rules above are decided. `before` and `after` are the scores of the agent in use and with the change. */
export function decideChange(a: { enabled: boolean; threshold: number; edit: Edit; before: Scores; after: Scores }): Decision {
  const worse = regressions(a.before, a.after);
  if (worse.length) return { action: "discard", why: `it would make the agent worse (${worse[0]}${worse.length > 1 ? `, and ${worse.length - 1} more` : ""})` };
  if (!improves(a.before, a.after)) return { action: "discard", why: "it does not improve any case" };
  if (!a.enabled) return { action: "propose", why: "auto-tuning is off: a person decides" };
  const r = riskOf(a.edit);
  if (r.risk === "propose_only") return { action: "propose", why: `${r.why}, so a person decides` };
  const ho = heldOutAlignment(a.before);
  if (ho === null) return { action: "propose", why: "there are no held-out cases to check it on, so a person decides" };
  if (ho >= a.threshold) return { action: "propose", why: `held-out alignment is ${(ho * 100).toFixed(1)}%, at or above the ${(a.threshold * 100).toFixed(0)}% limit for automatic changes, so a person decides` };
  return { action: "apply", why: `a low-risk edit, nothing got worse, and held-out alignment (${(ho * 100).toFixed(1)}%) is below the ${(a.threshold * 100).toFixed(0)}% limit` };
}

// ---- what the dashboard says -------------------------------------------------------------------------------------------

export type NoticeLevel = "running" | "on" | "stalled" | "off";
/** The message for the dashboard: it is shown to everyone who needs to know while the agent is tuning itself or may do so. */
export function noticeOf(s: AutoState): { level: NoticeLevel; threshold: number; last: CycleRecord | null } {
  const last = s.cycles[s.cycles.length - 1] ?? null;
  const level: NoticeLevel = s.running ? "running" : !s.enabled ? "off" : stalled(s) ? "stalled" : "on";
  return { level, threshold: s.threshold, last };
}
