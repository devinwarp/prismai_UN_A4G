import { createHash } from "node:crypto";
import { appendEntry, canon, verifyChain, type ChainEntry } from "./tuning.ts";
import type { CheckScope, EntityGoal, GoalCriterion } from "./goals.ts";

// The process targets of a use case: what it commits to deliver towards the goals of its entity. Pure: no I/O.
//
// The levels are:
//   entity goal       what the authority wants to achieve (goals.ts, read-only here)
//   process target    what THIS use case contributes, as a number with a unit and a way of measuring it (this file)
//   skill instruction how the agent does the work (the skill document)
//   pilot criteria    the thresholds the pilot is judged against (verdict-params.ts)
//
// Every target is linked to one goal of the use case's entity, so the entity's view can show which goals have a
// measurable contribution and which have none. The process owner proposes the targets and a person approves them. An
// approved set is immutable and carries a hash; changing a target means a new proposal and a new approval. Like the
// verdict parameters, this is a hash-chained log replayed into state. The numbers are the owner's to set: nothing
// here supplies defaults.

/** Where a target is measured: by the pilot before approval, or only once the agent is live (for example a survey). */
export const MEASURED_BY = ["pilot", "go_live"] as const;
export type MeasuredBy = (typeof MEASURED_BY)[number];
export const UNITS = ["percent", "business_hours", "minutes", "count"] as const;
export type Unit = (typeof UNITS)[number];
export const COMPARATORS = ["min", "max"] as const;
export type Comparator = (typeof COMPARATORS)[number];
/** The verdict parameter a pilot-measured target feeds, when there is one. */
export const PARAM_KEYS = ["accuracy_lower_bound_min", "alignment_goals_min", "hallucination_max", "refusal_min", "consistency_min", "audit_completeness_min", "client_facing_compliance_min", "latency_p95_ms_max", "cost_per_case_max"] as const;

/** The Prism criteria a per-test check can be tied to. */
export const CHECK_CRITERIA = ["accuracy", "hallucination", "human_final_approval", "ai_disclosure"] as const;
export const CHECK_SCOPES = ["all", "client_facing"] as const;

/** A target that is also asked of each pilot test, by the goal judge: a zero-tolerance acceptance check such as "no
 * message leaves without a recorded officer approval". `scope` says which tests it is asked of. */
export interface Check { criterion: GoalCriterion; scope: CheckScope }

/** An "outcome" target contributes to a goal of the entity. A "control" target is a compliance rule the agent must keep
 * whatever the goals are (an officer releases every message, the citizen is told it is an AI): it has no goal link, and
 * together with the outcome targets it is what the pilot must prove before release. A target without a kind is an outcome. */
export const KINDS = ["outcome", "control"] as const;
export type Kind = (typeof KINDS)[number];

export interface Target {
  id: string;
  kind?: Kind;
  /** The entity goal an outcome target contributes to. A control target has none. */
  goal_id?: string;
  /** The commitment in words, for example "First-response accuracy on officer-reviewed licence cases". */
  statement: string;
  comparator: Comparator;
  value: number;
  unit: Unit;
  measured_by: MeasuredBy;
  /** How and from what it is measured, for example "officer-reviewed sample of pilot cases". */
  evidence: string;
  /** Optional: the verdict parameter the pilot uses for this target. */
  param_key?: string;
  /** Optional: also judged per test by the goal judge (pilot-measured targets only). */
  check?: Check;
}

export const MAX_TARGETS = 30;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** What is wrong with a proposed set of targets. Empty means it is acceptable. `goals` are the entity's goals. */
export function validateTargets(raw: unknown, goals: EntityGoal[]): string[] {
  if (!Array.isArray(raw)) return ["Targets must be a list"];
  if (raw.length === 0) return ["Propose at least one target"];
  if (raw.length > MAX_TARGETS) return [`At most ${MAX_TARGETS} targets`];
  const errs: string[] = [];
  const ids = new Set<string>();
  const goalIds = new Set(goals.map((g) => g.id));
  raw.forEach((t, i) => {
    const at = `Target ${i + 1}`;
    if (!t || typeof t !== "object") { errs.push(`${at} must be an object`); return; }
    const o = t as Record<string, unknown>;
    const known = new Set(["id", "kind", "goal_id", "statement", "comparator", "value", "unit", "measured_by", "evidence", "param_key", "check"]);
    for (const k of Object.keys(o)) if (!known.has(k)) errs.push(`${at}: unknown field "${k}"`);
    const id = str(o.id).trim();
    if (!/^[A-Za-z0-9._-]{1,40}$/.test(id)) errs.push(`${at}: id must be 1 to 40 letters, digits, dot, dash or underscore`);
    else if (ids.has(id)) errs.push(`${at}: id ${id} is used twice`);
    else ids.add(id);
    if (o.kind !== undefined && !(KINDS as readonly string[]).includes(str(o.kind))) errs.push(`${at}: kind must be outcome or control`);
    if (o.kind === "control") {
      if (str(o.goal_id)) errs.push(`${at}: a control target is not linked to a goal`);
    } else if (!goalIds.has(str(o.goal_id))) errs.push(`${at}: goal ${str(o.goal_id) || "(none)"} is not a goal of this entity`);
    if (str(o.statement).trim().length < 5) errs.push(`${at}: the statement needs at least 5 characters`);
    if (str(o.statement).length > 300) errs.push(`${at}: the statement is over 300 characters`);
    if (!(COMPARATORS as readonly string[]).includes(str(o.comparator))) errs.push(`${at}: comparator must be min or max`);
    if (!(UNITS as readonly string[]).includes(str(o.unit))) errs.push(`${at}: unit must be one of ${UNITS.join(", ")}`);
    if (!isNum(o.value)) errs.push(`${at}: value must be a number`);
    else if (o.value < 0) errs.push(`${at}: value cannot be negative`);
    else if (o.unit === "percent" && o.value > 100) errs.push(`${at}: a percentage cannot be above 100`);
    if (!(MEASURED_BY as readonly string[]).includes(str(o.measured_by))) errs.push(`${at}: measured_by must be pilot or go_live`);
    if (str(o.evidence).trim().length < 5) errs.push(`${at}: say how it is measured (at least 5 characters)`);
    if (str(o.evidence).length > 300) errs.push(`${at}: the measurement note is over 300 characters`);
    if (o.param_key !== undefined) {
      if (!(PARAM_KEYS as readonly string[]).includes(str(o.param_key))) errs.push(`${at}: unknown verdict parameter "${str(o.param_key)}"`);
      else if (o.measured_by === "go_live") errs.push(`${at}: a go-live target cannot feed a pilot parameter`);
    }
    if (o.check !== undefined) {
      const c = o.check as Record<string, unknown> | null;
      if (!c || typeof c !== "object") errs.push(`${at}: check must be an object`);
      else {
        if (!(CHECK_CRITERIA as readonly string[]).includes(str(c.criterion))) errs.push(`${at}: check criterion must be one of ${CHECK_CRITERIA.join(", ")}`);
        if (!(CHECK_SCOPES as readonly string[]).includes(str(c.scope))) errs.push(`${at}: check scope must be all or client_facing`);
        if (o.measured_by === "go_live") errs.push(`${at}: a go-live target cannot be checked per test`);
      }
    }
  });
  return errs;
}

/** The per-test checks of a set of targets, in the shape the goal judge reads (the target's id and statement). */
export const checksOf = (targets: Target[]): EntityGoal[] => targets.filter((t) => t.check).map((t) => ({ id: t.id, text: t.statement, criterion: t.check!.criterion, scope: t.check!.scope }));

/** The hash an approved set carries. Order does not matter. */
export const targetsHash = (t: Target[]): string => createHash("sha256").update(canon([...t].sort((a, b) => (a.id < b.id ? -1 : 1)))).digest("hex");

/** The control targets: compliance rules with no goal link. */
export const controlsOf = (targets: Target[]): Target[] => targets.filter((t) => t.kind === "control");

/** Each goal with the outcome targets that contribute to it. A goal with none is a gap in the entity's view. */
export function coverage(goals: EntityGoal[], targets: Target[]): { goal: EntityGoal; targets: Target[] }[] {
  return goals.map((goal) => ({ goal, targets: targets.filter((t) => t.goal_id === goal.id) }));
}

// ---- the log ---------------------------------------------------------------------------------

export type TargetKind = "proposed" | "approved" | "withdrawn";
export type TargetEntry = ChainEntry<TargetKind>;
export interface ApprovedTargets { version: number; hash: string; targets: Target[]; approver: string; approver_source: string; at: string; by: string; self_approval_reason?: string }
export interface TargetState {
  pending: { version: number; targets: Target[]; by: string; note?: string } | null;
  approved: ApprovedTargets | null;
  proposals: number;
}
export const EMPTY_TARGETS: TargetState = { pending: null, approved: null, proposals: 0 };

export function replayTargets(entries: TargetEntry[]): TargetState {
  const s: TargetState = { pending: null, approved: null, proposals: 0 };
  for (const e of entries) {
    const p = e.payload;
    if (e.kind === "proposed") {
      s.proposals += 1;
      s.pending = { version: s.proposals, targets: p.targets as Target[], by: str(p.by), ...(str(p.note) ? { note: str(p.note) } : {}) };
    } else if (e.kind === "approved") {
      s.approved = { version: Number(p.version), hash: str(p.hash), targets: p.targets as Target[], approver: str(p.approver), approver_source: str(p.approver_source), at: e.at, by: str(p.by), ...(str(p.self_approval_reason) ? { self_approval_reason: str(p.self_approval_reason) } : {}) };
      s.pending = null;
    } else if (e.kind === "withdrawn") {
      s.approved = null;
    }
  }
  return s;
}

export type TargetAction =
  | { type: "propose"; targets: unknown; note?: string }
  | { type: "approve"; approver: { title: string; source: string }; self_approval_reason?: string }
  | { type: "withdraw"; reason: string };

export type TargetPlan = { ok: true; kind: TargetKind; payload: Record<string, unknown> } | { ok: false; error: string };
const bad = (error: string): TargetPlan => ({ ok: false, error });
const first = (errs: string[]) => errs.slice(0, 4).join("; ") + (errs.length > 4 ? `; and ${errs.length - 4} more` : "");

/** One change to the targets. `goals` are the entity's goals now: a proposal is checked against them when it is
 * written and again when it is approved, because a goal may have been removed in between. */
export function planTargets(state: TargetState, a: TargetAction, by: string, goals: EntityGoal[]): TargetPlan {
  if (a.type === "propose") {
    const errs = validateTargets(a.targets, goals);
    if (errs.length) return bad(first(errs));
    const t = (a.targets as Target[]).map((x) => ({ ...x, id: x.id.trim(), statement: x.statement.trim(), evidence: x.evidence.trim() }));
    if (state.approved && !state.pending && targetsHash(t) === state.approved.hash) return bad("These targets are already approved and nothing has changed");
    return { ok: true, kind: "proposed", payload: { targets: t, ...(a.note ? { note: a.note } : {}), by } };
  }
  if (a.type === "approve") {
    if (!state.pending) return bad("There is no proposal waiting for approval");
    const errs = validateTargets(state.pending.targets, goals);
    if (errs.length) return bad(`The proposal no longer fits the entity's goals: ${errs[0]}`);
    const own = !!by && state.pending.by === by;
    if (own && !str(a.self_approval_reason).trim()) return bad("You proposed these targets, so you cannot also approve them unless you give the reason (recorded in the log)");
    return { ok: true, kind: "approved", payload: { version: state.pending.version, hash: targetsHash(state.pending.targets), targets: state.pending.targets, approver: a.approver.title, approver_source: a.approver.source, ...(own ? { self_approval_reason: a.self_approval_reason!.trim() } : {}), by } };
  }
  if (!state.approved) return bad("There is no approval to withdraw");
  if (str(a.reason).trim().length < 3) return bad("Withdrawing an approval needs a reason");
  return { ok: true, kind: "withdrawn", payload: { version: state.approved.version, reason: a.reason.trim(), by } };
}

export const appendTargets = (prev: TargetEntry | null, kind: TargetKind, actor: string, payload: Record<string, unknown>, at: string): TargetEntry => appendEntry<TargetKind>(prev, kind, actor, payload, at);
export const verifyTargets = (entries: TargetEntry[]) => verifyChain(entries);

/** The text of a target for a screen or report: "at least 98 % ...". */
export function describeTarget(t: Target): string {
  const unit = t.unit === "percent" ? "%" : t.unit === "business_hours" ? "business hours" : t.unit;
  return `${t.comparator === "min" ? "at least" : "at most"} ${t.value} ${unit}`;
}

/** A readable message for a store error: a missing table says which file to apply. */
export function describeTargetStoreError(message: string): string {
  return /un_target_log/.test(message) && /does not exist|schema cache|not find/i.test(message)
    ? "The targets table (un_target_log) does not exist. Apply supabase/un-targets.sql to the database."
    : message;
}
