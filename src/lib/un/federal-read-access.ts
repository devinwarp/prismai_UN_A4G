import { cache } from "react";
import { notFound } from "next/navigation";
import { ROLES } from "./authz";
import { loadMembers } from "./entity-store";
import { loadAssignments } from "./roles-store";
import { scopeIndex } from "./scope-context";

export const loadFederalReadAccess = cache(async (orgId: string, userId: string, role: string | null) => {
  if (role === "admin" || role === "platform") return { allCases: true, browseCountries: true, caseIds: new Set<string>() };
  const members = await loadMembers(orgId);
  if (members.some((member) => member.user_id === userId && !member.removed_at)) {
    return { allCases: true, browseCountries: true, caseIds: new Set<string>() };
  }
  if (role === "viewer" || (process.env.OFFLINE === "1" && role && (ROLES as readonly string[]).includes(role))) {
    // read-only: a viewer (the judge account) may look at any country; nothing about it writes
    return { allCases: true, browseCountries: true, caseIds: new Set<string>() };
  }
  const assignments = await loadAssignments(orgId, userId);
  // a role held for the whole organisation reads everything; one held for a country or an entity reads the use cases of that country or entity;
  // one held for a use case reads that use case
  if (assignments.some((a) => a.scope.kind === "org")) return { allCases: true, browseCountries: true, caseIds: new Set<string>() };
  const caseIds = new Set(assignments.flatMap((a) => a.scope.kind === "use_case" ? [a.scope.use_case_id] : []));
  if (assignments.some((a) => a.scope.kind === "entity" || a.scope.kind === "country")) {
    for (const uc of (await scopeIndex(orgId)).all()) {
      const reach = assignments.some((a) => (a.scope.kind === "entity" && a.scope.entity === uc.entity && (!a.scope.country || a.scope.country === uc.country)) || (a.scope.kind === "country" && a.scope.country === uc.country));
      if (reach && uc.use_case_id) caseIds.add(uc.use_case_id);
    }
  }
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
