import { can, ROLES, type Assignment, type RoleId } from "./authz.ts";
import type { MemberRow } from "./entity-admin.ts";
import type { AssignmentRow } from "./role-admin.ts";
import type { Person } from "./roles-store";

export const isSuperUser = (userId: string, role: string | null, designatedId = process.env.FEDERAL_SUPER_USER_ID?.trim()) =>
  role === "platform" && userId === designatedId;

/** Who may open Federal Compare and compare countries side by side: the designated super user, and the read-only viewer account the judges use, so a judge
 * sees every feature the super user sees. Both pages only read; every route that writes still refuses a viewer. The people directory is NOT opened
 * this way: it holds real people's details, and the judge account is shared in public. */
export const canCompareCountries = (userId: string, role: string | null, designatedId = process.env.FEDERAL_SUPER_USER_ID?.trim()) =>
  isSuperUser(userId, role, designatedId) || role === "viewer";

export function scopePeople<T extends { id: string }>(data: { people: Person[]; rows: AssignmentRow[]; useCases: T[]; federal: MemberRow[] }, userId: string, role: string | null) {
  const mine = data.rows.filter((row) => row.user_id === userId && !row.revoked_at);
  const assignments = mine.flatMap((row): Assignment[] => (ROLES as readonly string[]).includes(row.role) ? [{
    role: row.role as RoleId,
    scope: row.use_case_id ? { kind: "use_case", use_case_id: row.use_case_id } : { kind: "org" },
  }] : []);
  const mayManage = can({ legacyRole: role, assignments }, "users.manage").ok;
  const federalIds = new Set(data.federal.filter((row) => !row.removed_at).map((row) => row.user_id));
  const federalMember = federalIds.has(userId);
  if (mayManage || federalMember) return { ...data, mayManage, federalMember };

  const cases = new Set(mine.flatMap((row) => row.use_case_id ? [row.use_case_id] : []));
  const senior = new Set(data.rows.filter((row) => !row.revoked_at && (row.role === "platform_admin" || row.role === "governance_admin")).map((row) => row.user_id));
  const colleagues = new Set(data.rows.filter((row) => !row.revoked_at && row.use_case_id && cases.has(row.use_case_id)).map((row) => row.user_id));
  const people = data.people.filter((person) => person.id === userId || (colleagues.has(person.id)
    && !federalIds.has(person.id) && !senior.has(person.id) && person.legacy_role !== "admin" && person.legacy_role !== "platform"));
  const visible = new Set(people.map((person) => person.id));
  return {
    mayManage, federalMember, people,
    rows: data.rows.filter((row) => row.user_id === userId || (visible.has(row.user_id) && row.use_case_id && cases.has(row.use_case_id)))
      .map((row) => ({ ...row, granted_by: row.granted_by && visible.has(row.granted_by) ? row.granted_by : null, revoked_by: row.revoked_by && visible.has(row.revoked_by) ? row.revoked_by : null })),
    useCases: data.useCases.filter((useCase) => cases.has(useCase.id)),
    federal: [],
  };
}
