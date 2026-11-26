import { ROLES, type RoleId } from "./authz.ts";

// Who may hold which role, and the rules for granting and taking one back. Pure; the route and the store call it.
//
//  - a role is held at one scope: the organisation, a country, an entity, or one use case. Which scopes each role may have is ROLE_SCOPES: the platform
//    admin is organisation-wide; the governance admin is for the organisation, a country or an entity but never one use case; the entity admin is
//    for one entity; the others are for the organisation, an entity or one use case (the viewer, the organisation only);
//  - a person holds a role at a scope once: granting it again is refused;
//  - nobody changes their own roles (a person cannot give themselves more access, or quietly drop what limits them);
//  - a revoked assignment stays in the history with who revoked it and when;
//  - the business process owner is never just removed: an administrator can take the role away only by replacing the person with a new
//    process owner for the same scope in one step, so a process is never left without one.

export const ORG_ONLY: readonly RoleId[] = ["platform_admin", "governance_admin"];
export type ScopeKind = "org" | "country" | "entity" | "use_case";
export const ROLE_SCOPES: Record<RoleId, readonly ScopeKind[]> = {
  platform_admin: ["org"],
  governance_admin: ["org", "country", "entity"],
  entity_admin: ["entity"],
  process_owner: ["org", "use_case"],
  test_author: ["org", "entity", "use_case"],
  operator: ["org", "entity", "use_case"],
  viewer: ["org"],
};
/** Roles an entity admin may give, and only for their own entity's people: never a role that approves or administers. */
export const ENTITY_GRANTABLE: readonly RoleId[] = ["process_owner", "test_author", "operator", "viewer"];
export const OWNER_EXISTS = "This use case already has a process owner. Use Replace to transfer ownership.";

export interface AssignmentRow {
  id: string;
  user_id: string;
  role: string;
  use_case_id: string | null;
  /** the country or entity the role is held for, when it is held for one (otherwise both are null and use_case_id says the scope) */
  scope_country?: string | null;
  scope_entity?: string | null;
  granted_by: string | null;
  granted_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
}

export type GrantAction =
  | { type: "grant"; user_id: string; role: string; use_case_id: string | null; country?: string | null; entity?: string | null }
  | { type: "revoke"; assignment_id: string }
  | { type: "replace_process_owner"; assignment_id: string; user_id: string };

export type GrantPlan =
  | { ok: true; type: "grant"; row: { user_id: string; role: RoleId; use_case_id: string | null; granted_by: string; scope_country?: string; scope_entity?: string } }
  | { ok: true; type: "revoke"; assignment_id: string; revoked_by: string }
  | { ok: true; type: "replace"; grant: { user_id: string; role: RoleId; use_case_id: string | null; granted_by: string }; revoke: { assignment_id: string; revoked_by: string } }
  | { ok: false; error: string };

const bad = (error: string): GrantPlan => ({ ok: false, error });

/** The entity a grant, revoke or replacement concerns, so an entity admin can be checked against their own entity. Null when it concerns no single entity
 * (the whole organisation, or a country). */
export function entityOfAction(a: GrantAction, o: { rows: AssignmentRow[]; useCases: { id: string; entity: string }[] }): string | null {
  const ofUseCase = (id: string | null | undefined) => (id ? o.useCases.find((u) => u.id === id)?.entity ?? null : null);
  if (a.type === "grant") return a.entity ?? ofUseCase(a.use_case_id);
  const r = o.rows.find((x) => x.id === a.assignment_id);
  return r ? r.scope_entity ?? ofUseCase(r.use_case_id) : null;
}

/** What an entity admin may do with people: give or take back process owner, test author, operator and viewer roles, for use cases of their own entity
 * or for their entity as a whole. Never a role that approves or administers, and nothing for another entity. Returns an error, or null. */
export function entityAdminMay(a: GrantAction, entity: string, o: { rows: AssignmentRow[]; useCases: { id: string; entity: string }[] }): string | null {
  if (entityOfAction(a, o) !== entity) return "That is outside your entity";
  if (a.type === "grant") {
    if (!(ENTITY_GRANTABLE as readonly string[]).includes(a.role)) return "An entity admin can give process owner, test author, operator and viewer roles only";
    if (a.country && !a.entity) return "An entity admin cannot give a role for a whole country";
    return null;
  }
  const r = o.rows.find((x) => x.id === a.assignment_id);
  if (!r || !(ENTITY_GRANTABLE as readonly string[]).includes(r.role)) return "An entity admin can take back process owner, test author, operator and viewer roles only";
  return null;
}

/** Decide a grant or a revoke against the assignments that exist. `knownUsers` and `knownUseCases` are the ids the
 * organisation has; `by` is the person making the change. */
export function planGrant(a: GrantAction, o: { rows: AssignmentRow[]; knownUsers: string[]; knownUseCases: string[]; knownEntities?: string[]; knownCountries?: string[]; by: string }): GrantPlan {
  if (a.type === "revoke") {
    const r = o.rows.find((x) => x.id === a.assignment_id);
    if (!r) return bad("That assignment does not exist");
    if (r.revoked_at) return bad("That assignment is already revoked");
    if (r.user_id === o.by) return bad("You cannot change your own roles; ask another administrator");
    if (r.role === "process_owner") return bad("The process owner cannot be removed on their own: replace them with a new process owner for this process, so it is never left without one");
    return { ok: true, type: "revoke", assignment_id: r.id, revoked_by: o.by };
  }
  if (a.type === "replace_process_owner") {
    const r = o.rows.find((x) => x.id === a.assignment_id);
    if (!r) return bad("That assignment does not exist");
    if (r.revoked_at) return bad("That assignment is already revoked");
    if (r.role !== "process_owner") return bad("Only a process owner is replaced this way");
    if (r.user_id === o.by) return bad("You cannot change your own roles; ask another administrator");
    if (!o.knownUsers.includes(a.user_id)) return bad("That person is not in this organisation");
    if (a.user_id === o.by) return bad("You cannot change your own roles; ask another administrator");
    if (a.user_id === r.user_id) return bad("The new process owner must be a different person");
    if (o.rows.some((x) => !x.revoked_at && x.user_id === a.user_id && x.role === "process_owner" && (x.use_case_id ?? null) === (r.use_case_id ?? null))) return bad("That person is already a process owner for this scope");
    return { ok: true, type: "replace", grant: { user_id: a.user_id, role: "process_owner", use_case_id: r.use_case_id ?? null, granted_by: o.by }, revoke: { assignment_id: r.id, revoked_by: o.by } };
  }
  if (!(ROLES as readonly string[]).includes(a.role)) return bad(`Unknown role "${a.role}"`);
  const role = a.role as RoleId;
  if (!o.knownUsers.includes(a.user_id)) return bad("That person is not in this organisation");
  if (a.user_id === o.by) return bad("You cannot change your own roles; ask another administrator");
  const country = a.country ?? null, entity = a.entity ?? null;
  if (a.use_case_id !== null && (country || entity)) return bad("A role is held at one scope: a use case, an entity, a country, or the whole organisation");
  const kind: ScopeKind = a.use_case_id !== null ? "use_case" : entity ? "entity" : country ? "country" : "org";
  if (a.use_case_id !== null) {
    if (ORG_ONLY.includes(role)) return bad(`${role} is held for the whole organisation, not for one use case`);
    if (!o.knownUseCases.includes(a.use_case_id)) return bad("That use case is not in this organisation");
  }
  if (!ROLE_SCOPES[role].includes(kind)) return bad(`${role} cannot be held for ${kind === "org" ? "the whole organisation" : `a ${kind.replace("_", " ")}`}`);
  if (kind === "entity" && !o.knownEntities?.includes(entity!)) return bad("That entity is not in this organisation");
  if ((kind === "country" || (kind === "entity" && country)) && !o.knownCountries?.includes(country!)) return bad("That country is not known");
  if (o.rows.some((x) => !x.revoked_at && x.user_id === a.user_id && x.role === role && (x.use_case_id ?? null) === a.use_case_id
    && (x.scope_country ?? null) === country && (x.scope_entity ?? null) === entity)) {
    return bad("That person already holds this role at this scope");
  }
  if (role === "process_owner" && a.use_case_id && o.rows.some((x) => !x.revoked_at && x.role === role && x.use_case_id === a.use_case_id)) {
    return bad(OWNER_EXISTS);
  }
  return { ok: true, type: "grant", row: { user_id: a.user_id, role, use_case_id: a.use_case_id, granted_by: o.by, ...(country ? { scope_country: country } : {}), ...(entity ? { scope_entity: entity } : {}) } };
}
