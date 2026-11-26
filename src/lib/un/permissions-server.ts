import { can, type ActionId } from "./authz";
import { loadAssignments } from "./roles-store";
import { scopeIndex } from "./scope-context";

/** What the signed-in person may do, for a server page: the same check the API routes make, so the page shows a
 * button only to someone the route would accept. */
export async function permissionsFor(profile: { role?: string | null; org_id?: string | null }, userId: string) {
  const assignments = profile.org_id ? await loadAssignments(profile.org_id, userId) : [];
  const index = profile.org_id ? await scopeIndex(profile.org_id) : null;
  const subject = { legacyRole: profile.role ?? null, assignments };
  // A use-case action is checked in its use case, entity and country; an entity action (setup, people) in its entity and country.
  return {
    can: (action: ActionId, useCaseId?: string, entity?: string): boolean =>
      can(subject, action, useCaseId ? (index?.useCase(useCaseId) ?? { use_case_id: useCaseId }) : entity && index ? index.entity(entity) : {}).ok,
  };
}
