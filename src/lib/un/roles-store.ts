import { createAdminClient } from "@/lib/supabase/admin";
import { ROLES, type Assignment, type RoleId, type Scope } from "./authz";
import { OWNER_EXISTS, type AssignmentRow } from "./role-admin";

interface ScopeColumns { use_case_id?: string | null; scope_country?: string | null; scope_entity?: string | null }

/** The scope a stored assignment is held at. The country and entity columns (supabase/un-scoped-roles.sql) may not exist yet: then every row is an
 * organisation or use-case assignment, as before. */
export function scopeOfRow(r: ScopeColumns): Scope {
  if (r.use_case_id) return { kind: "use_case", use_case_id: r.use_case_id };
  if (r.scope_entity) return { kind: "entity", entity: r.scope_entity, ...(r.scope_country ? { country: r.scope_country } : {}) };
  if (r.scope_country) return { kind: "country", country: r.scope_country };
  return { kind: "org" };
}

/** The live role assignments of one person (supabase/un-roles.sql, not applied yet). Empty if the table is absent
 * or the person has none; their stored profile role still applies (see authz.ts). Reads every column, so it works before and after the scope columns exist. */
export async function loadAssignments(orgId: string, userId: string): Promise<Assignment[]> {
  const { data } = await createAdminClient()
    .from("un_role_assignments")
    .select("*")
    .eq("org_id", orgId)
    .eq("user_id", userId);
  return ((data ?? []) as ({ role: string; revoked_at: string | null } & ScopeColumns)[])
    .filter((r) => !r.revoked_at && (ROLES as readonly string[]).includes(r.role))
    .map((r): Assignment => ({ role: r.role as RoleId, scope: scopeOfRow(r) }));
}

export interface Person { id: string; email: string | null; full_name?: string | null; job_title: string | null; legacy_role: string | null }

/** Everyone in the organisation, with the role stored on their profile. */
export async function loadPeople(orgId: string): Promise<Person[]> {
  const { data } = await createAdminClient().from("profiles").select("id, email, full_name, job_title, role").eq("org_id", orgId);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ id: String(r.id), email: (r.email as string | null) ?? null, full_name: (r.full_name as string | null) ?? null, job_title: (r.job_title as string | null) ?? null, legacy_role: (r.role as string | null) ?? null }));
}

/** Every assignment of the organisation, live and revoked, oldest first. */
export async function loadAssignmentRows(orgId: string): Promise<AssignmentRow[]> {
  const { data } = await createAdminClient().from("un_role_assignments").select("*").eq("org_id", orgId);
  return ((data ?? []) as Record<string, unknown>[])
    .map((r) => ({ id: String(r.id), user_id: String(r.user_id), role: String(r.role), use_case_id: (r.use_case_id as string | null) ?? null, scope_country: (r.scope_country as string | null) ?? null, scope_entity: (r.scope_entity as string | null) ?? null, granted_by: (r.granted_by as string | null) ?? null, granted_at: new Date(String(r.granted_at ?? r.created_at ?? Date.now())).toISOString(), revoked_at: r.revoked_at ? new Date(String(r.revoked_at)).toISOString() : null, revoked_by: (r.revoked_by as string | null) ?? null }))
    .sort((a, b) => (a.granted_at < b.granted_at ? -1 : 1));
}

/** Returns an error message, or null. */
export async function insertAssignment(orgId: string, row: { user_id: string; role: RoleId; use_case_id: string | null; granted_by: string; scope_country?: string; scope_entity?: string }): Promise<string | null> {
  const { error } = await createAdminClient().from("un_role_assignments").insert({ org_id: orgId, ...row, granted_at: new Date().toISOString() });
  return error?.message.includes("un_role_assignments_one_process_owner_idx") ? OWNER_EXISTS : error?.message ?? null;
}

export async function replaceProcessOwner(orgId: string, assignmentId: string, successorId: string, actorId: string): Promise<string | null> {
  const { error } = await createAdminClient().rpc("un_replace_process_owner", {
    p_org_id: orgId, p_assignment_id: assignmentId, p_user_id: successorId, p_actor_id: actorId,
  });
  return error?.message ?? null;
}

/** Marks an assignment revoked; the row stays. Returns an error message, or null. */
export async function revokeAssignment(orgId: string, id: string, by: string): Promise<string | null> {
  const { error } = await createAdminClient().from("un_role_assignments").update({ revoked_at: new Date().toISOString(), revoked_by: by }).eq("org_id", orgId).eq("id", id);
  return error?.message ?? null;
}

/** The organisation's use cases, for choosing a scope. */
export async function loadUseCaseChoices(orgId: string): Promise<{ id: string; ext_id: string; title: string; entity: string }[]> {
  const { data } = await createAdminClient().from("un_use_cases").select("id, ext_id, title, entity").eq("org_id", orgId);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ id: String(r.id), ext_id: String(r.ext_id), title: String(r.title ?? ""), entity: String(r.entity ?? "") })).sort((a, b) => a.ext_id.localeCompare(b.ext_id));
}
