import { can, type ActionId } from "./authz";
import { loadAssignments } from "./roles-store";

/** What the signed-in person may do, for a server page: the same check the API routes make, so the page shows a
 * button only to someone the route would accept. */
export async function permissionsFor(profile: { role?: string | null; org_id?: string | null }, userId: string) {
  const assignments = profile.org_id ? await loadAssignments(profile.org_id, userId) : [];
  const subject = { legacyRole: profile.role ?? null, assignments };
  return { can: (action: ActionId, useCaseId?: string): boolean => can(subject, action, { use_case_id: useCaseId }).ok };
}
