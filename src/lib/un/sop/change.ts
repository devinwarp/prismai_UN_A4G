// A change request to move a DEPLOYED use case to a newer version of its SOP. Pure: the route and the store call it.
//
// A use case that is deployed (in production) stays on the SOP version it has: new versions do not reach it by themselves. Its business process owner
// may ask to move it, and must say WHY and give a PLAN for the change (what will be checked, in what order, how it can be undone). An admin then applies
// the change (the use case moves to the version, its job profiles follow, and it is rerun) or declines it with a note. One request is open at a time.
// A use case that is not deployed has no need of this: it follows every new version at once.

export const MIN_REASON = 10;
export const MIN_PLAN = 20;
export const MAX_TEXT = 2000;
export const needsChangeRequest = (stage: string): boolean => stage === "deployed";

export interface SopChangeRequest {
  id: string; use_case_id: string; sop_id: string; from_version: number; to_version: number;
  requested_by: string; requested_email: string | null; reason: string; plan: string; requested_at: string;
  status: "open" | "applied" | "declined"; resolved_by: string | null; resolved_at: string | null; note: string | null; run_id: string | null;
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/[ \t]+/g, " ").slice(0, max + 1) : "");

export function parseChange(reasonIn: unknown, planIn: unknown): { ok: true; reason: string; plan: string } | { ok: false; error: string } {
  const reason = clean(reasonIn, MAX_TEXT), plan = clean(planIn, MAX_TEXT);
  if (reason.length < MIN_REASON) return { ok: false, error: `Say why the change is needed (at least ${MIN_REASON} characters).` };
  if (plan.length < MIN_PLAN) return { ok: false, error: `Give a plan for the change: what will be checked, in what order, and how it can be undone (at least ${MIN_PLAN} characters).` };
  if (reason.length > MAX_TEXT || plan.length > MAX_TEXT) return { ok: false, error: `The reason and the plan are at most ${MAX_TEXT} characters each.` };
  return { ok: true, reason, plan };
}

export type Plan = { ok: true } | { ok: false; status: number; error: string };
const no = (status: number, error: string): Plan => ({ ok: false, status, error });

/** May a request be made? Only for a deployed use case that is behind the latest version, with no request already open. */
export function planChangeRequest(o: { stage: string; attached: number; latest: number; open: boolean }): Plan {
  if (!needsChangeRequest(o.stage)) return no(409, "A use case that is not deployed moves to a new SOP version by itself: no request is needed.");
  if (o.attached >= o.latest) return no(409, "This use case is already on the latest version of its SOP.");
  if (o.open) return no(409, "A change has already been requested for this use case and is waiting for an admin.");
  return { ok: true };
}

/** May the open request be applied or declined? */
export function planResolve(r: Pick<SopChangeRequest, "status"> | null): Plan {
  if (!r) return no(409, "There is no open change request for this use case.");
  if (r.status !== "open") return no(409, "That request has already been dealt with.");
  return { ok: true };
}
