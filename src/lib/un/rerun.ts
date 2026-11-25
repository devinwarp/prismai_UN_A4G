// Rerunning a use case's verdict, and who may. Pure: the route, the store and the dashboard call it.
//
// A rerun is a NEW run of the use case's staged scenario under the rules and SOP as they are now (gates-rerun.ts). The verdict already written to the
// use case, its run and its signature are never touched: a person signs the new run if they accept it.
//
//  - an admin reruns a use case that is not yet in production directly, as often as wanted;
//  - a use case that is deployed (in production) is rerun only after its business process owner has REQUESTED it, with a reason; until then the
//    rerun is not available. A request is used up by the rerun it allows; a later rerun needs a new request;
//  - nothing reruns a deployed use case by itself: changing a country's rules, replacing its policy documents or changing a use case's SOP only
//    marks the use case as out of date ("rules or SOP changed since its last run"); an admin reruns it from the dashboard once it is wanted;
//  - a use case with no earlier run has nothing to repeat: a scenario has to be run first.

export const MIN_REASON = 10;
export const MAX_REASON = 500;
/** The stages that mean "in production". */
export const needsRequest = (stage: string): boolean => stage === "deployed";

export interface RerunRequest {
  id: string; use_case_id: string; requested_by: string; requested_email: string | null; reason: string; requested_at: string;
  status: "open" | "done"; resolved_by: string | null; resolved_at: string | null; run_id: string | null;
}
export interface RerunState { hasRun: boolean; lastRunAt: string | null; open: RerunRequest | null; stale: StaleInfo | null }
export interface StaleInfo { since: string; why: "country_rules" | "country_policy" | "sop" | "profile" }

/** What the rerun icon on a dashboard row shows. */
export type RerunButton = "ready" | "needs_request" | "requested" | "no_run";
export function buttonFor(stage: string, s: Pick<RerunState, "hasRun" | "open">): RerunButton {
  if (!s.hasRun) return "no_run";
  if (needsRequest(stage)) return s.open ? "requested" : "needs_request";
  return "ready";
}

export function parseReason(raw: unknown): { ok: true; reason: string } | { ok: false; error: string } {
  const r = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (r.length < MIN_REASON) return { ok: false, error: `Say why the rerun is wanted (at least ${MIN_REASON} characters).` };
  if (r.length > MAX_REASON) return { ok: false, error: `The reason is at most ${MAX_REASON} characters.` };
  return { ok: true, reason: r };
}

export type Plan = { ok: true } | { ok: false; status: number; error: string };
const no = (status: number, error: string): Plan => ({ ok: false, status, error });

/** May a request be made now? Only for a deployed use case that has an earlier run and no request already open. */
export function planRequest(stage: string, s: Pick<RerunState, "hasRun" | "open">): Plan {
  if (!needsRequest(stage)) return no(409, "Only a deployed use case needs a request: an admin can rerun this one directly.");
  if (!s.hasRun) return no(409, "There is no earlier run to repeat: run a scenario first.");
  if (s.open) return no(409, "A rerun has already been requested for this use case and is waiting for an admin.");
  return { ok: true };
}

/** May the rerun be done now? */
export function planRerun(stage: string, s: Pick<RerunState, "hasRun" | "open">): Plan {
  if (!s.hasRun) return no(409, "There is no earlier run to repeat: run a scenario first.");
  if (needsRequest(stage) && !s.open) return no(409, "A deployed use case is rerun only after its business process owner has requested it, with a reason.");
  return { ok: true };
}

interface LogLike { kind: string; at: string; payload: Record<string, unknown> }
/** Whether the rules or the SOP a use case was last run under have changed since: a change to its country's rule set or policy documents, or to its own
 * SOP or job profiles, later than its last run. Returns the latest such change, or null. */
export function staleSince(entries: LogLike[], o: { country: string; ext: string; lastRunAt: string | null }): StaleInfo | null {
  if (!o.lastRunAt) return null;
  let hit: StaleInfo | null = null;
  for (const e of entries) {
    const p = e.payload ?? {};
    let why: StaleInfo["why"] | null = null;
    if (e.kind === "country_updated" && p.id === o.country && (p.patch as { ruleset?: string } | undefined)?.ruleset) why = "country_rules";
    else if (e.kind === "policy_added" && (p.policy as { country?: string } | undefined)?.country === o.country) why = "country_policy";
    else if (e.kind === "sop_changed" && p.use_case === o.ext) why = "sop";
    else if (e.kind === "profile_changed" && p.use_case === o.ext) why = "profile";
    if (why && e.at > o.lastRunAt && (!hit || e.at > hit.since)) hit = { since: e.at, why };
  }
  return hit;
}
