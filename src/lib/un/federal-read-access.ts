import { cache } from "react";
import { notFound } from "next/navigation";
import { ROLES } from "./authz";
import { loadMembers } from "./entity-store";
import { loadAssignments } from "./roles-store";

export const loadFederalReadAccess = cache(async (orgId: string, userId: string, role: string | null) => {
  if (role === "admin" || role === "platform") return { allCases: true, browseCountries: true, caseIds: new Set<string>() };
  const members = await loadMembers(orgId);
  if (members.some((member) => member.user_id === userId && !member.removed_at)) {
    return { allCases: true, browseCountries: true, caseIds: new Set<string>() };
  }
  if (role === "viewer" || (process.env.OFFLINE === "1" && role && (ROLES as readonly string[]).includes(role))) {
    return { allCases: true, browseCountries: false, caseIds: new Set<string>() };
  }
  const assignments = await loadAssignments(orgId, userId);
  const caseIds = new Set(assignments.flatMap((a) => a.scope.kind === "use_case" ? [a.scope.use_case_id] : []));
  return { allCases: false, browseCountries: true, caseIds };
});

export async function mayReadUseCase(orgId: string, userId: string, role: string | null, caseId: string) {
  const access = await loadFederalReadAccess(orgId, userId, role);
  return access.allCases || access.caseIds.has(caseId);
}

export async function requireFederalToolAccess(orgId: string, userId: string, role: string | null) {
  const access = await loadFederalReadAccess(orgId, userId, role);
  if (!access.allCases) notFound();
  return access;
}
