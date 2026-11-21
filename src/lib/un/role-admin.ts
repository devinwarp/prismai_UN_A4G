import { ROLES, type RoleId } from "./authz.ts";

// Who may hold which role, and the rules for granting and taking one back. Pure; the route and the store call it.
//
//  - platform_admin and governance_admin are about the whole organisation, so they cannot be held for one use case;
//  - a person holds a role at a scope once: granting it again is refused;
//  - nobody changes their own roles (a person cannot give themselves more access, or quietly drop what limits them);
//  - a revoked assignment stays in the history with who revoked it and when.

export const ORG_ONLY: readonly RoleId[] = ["platform_admin", "governance_admin"];

export interface AssignmentRow {
  id: string;
  user_id: string;
  role: string;
  use_case_id: string | null;
  granted_by: string | null;
  granted_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
}

export type GrantAction =
  | { type: "grant"; user_id: string; role: string; use_case_id: string | null }
  | { type: "revoke"; assignment_id: string };

export type GrantPlan =
  | { ok: true; type: "grant"; row: { user_id: string; role: RoleId; use_case_id: string | null; granted_by: string } }
  | { ok: true; type: "revoke"; assignment_id: string; revoked_by: string }
  | { ok: false; error: string };

const bad = (error: string): GrantPlan => ({ ok: false, error });

/** Decide a grant or a revoke against the assignments that exist. `knownUsers` and `knownUseCases` are the ids the
 * organisation has; `by` is the person making the change. */
export function planGrant(a: GrantAction, o: { rows: AssignmentRow[]; knownUsers: string[]; knownUseCases: string[]; by: string }): GrantPlan {
  if (a.type === "revoke") {
    const r = o.rows.find((x) => x.id === a.assignment_id);
    if (!r) return bad("That assignment does not exist");
    if (r.revoked_at) return bad("That assignment is already revoked");
    if (r.user_id === o.by) return bad("You cannot change your own roles; ask another administrator");
    return { ok: true, type: "revoke", assignment_id: r.id, revoked_by: o.by };
  }
  if (!(ROLES as readonly string[]).includes(a.role)) return bad(`Unknown role "${a.role}"`);
  const role = a.role as RoleId;
  if (!o.knownUsers.includes(a.user_id)) return bad("That person is not in this organisation");
  if (a.user_id === o.by) return bad("You cannot change your own roles; ask another administrator");
  if (a.use_case_id !== null) {
    if (ORG_ONLY.includes(role)) return bad(`${role} is held for the whole organisation, not for one use case`);
    if (!o.knownUseCases.includes(a.use_case_id)) return bad("That use case is not in this organisation");
  }
  if (o.rows.some((x) => !x.revoked_at && x.user_id === a.user_id && x.role === role && (x.use_case_id ?? null) === a.use_case_id)) {
    return bad("That person already holds this role at this scope");
  }
  return { ok: true, type: "grant", row: { user_id: a.user_id, role, use_case_id: a.use_case_id, granted_by: o.by } };
}
