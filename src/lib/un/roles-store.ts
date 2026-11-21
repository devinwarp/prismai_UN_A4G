import { createAdminClient } from "@/lib/supabase/admin";
import { ROLES, type Assignment, type RoleId } from "./authz";

/** The live role assignments of one person (supabase/un-roles.sql, not applied yet). Empty if the table is absent
 * or the person has none; their stored profile role still applies (see authz.ts). */
export async function loadAssignments(orgId: string, userId: string): Promise<Assignment[]> {
  const { data } = await createAdminClient()
    .from("un_role_assignments")
    .select("role, use_case_id, revoked_at")
    .eq("org_id", orgId)
    .eq("user_id", userId);
  return ((data ?? []) as { role: string; use_case_id: string | null; revoked_at: string | null }[])
    .filter((r) => !r.revoked_at && (ROLES as readonly string[]).includes(r.role))
    .map((r): Assignment => ({ role: r.role as RoleId, scope: r.use_case_id ? { kind: "use_case", use_case_id: r.use_case_id } : { kind: "org" } }));
}
