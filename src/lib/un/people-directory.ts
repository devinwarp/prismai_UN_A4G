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

export function scopePeople<T extends { id: string; entity?: string }>(data: { people: Person[]; rows: AssignmentRow[]; useCases: T[]; federal: MemberRow[] }, userId: string, role: string | null) {
  const mine = data.rows.filter((row) => row.user_id === userId && !row.revoked_at);
  const assignments = mine.flatMap((row): Assignment[] => (ROLES as readonly string[]).includes(row.role) ? [{
    role: row.role as RoleId,
    scope: row.use_case_id ? { kind: "use_case", use_case_id: row.use_case_id } : row.scope_entity ? { kind: "entity", entity: row.scope_entity, ...(row.scope_country ? { country: row.scope_country } : {}) }
      : row.scope_country ? { kind: "country", country: row.scope_country } : { kind: "org" },
  }] : []);
  const mayManage = can({ legacyRole: role, assignments }, "users.manage").ok;
  const federalIds = new Set(data.federal.filter((row) => !row.removed_at).map((row) => row.user_id));
  const federalMember = federalIds.has(userId);
  if (mayManage || federalMember) return { ...data, mayManage, federalMember, entityAdminOf: [] as string[] };

  // An entity admin sees everyone assigned in their own entity (a role for the entity, or for one of its use cases), and nothing of the rest.
  const myEntities = [...new Set(mine.filter((row) => row.role === "entity_admin" && row.scope_entity).map((row) => row.scope_entity as string))];
  if (myEntities.length) {
    const entityOf = new Map(data.useCases.map((u) => [u.id, u.entity]));
    const inMine = (row: AssignmentRow) => (row.scope_entity ? myEntities.includes(row.scope_entity) : !!row.use_case_id && myEntities.includes(entityOf.get(row.use_case_id) ?? ""));
    const reach = data.rows.filter(inMine);
    const seeIds = new Set([userId, ...reach.map((row) => row.user_id)]);
    const people = data.people.filter((person) => seeIds.has(person.id) && (person.id === userId || (person.legacy_role !== "admin" && person.legacy_role !== "platform")));
    const shown = new Set(people.map((person) => person.id));
    return {
      mayManage: false, federalMember: false, people, entityAdminOf: myEntities,
      rows: data.rows.filter((row) => row.user_id === userId || (shown.has(row.user_id) && inMine(row)))
        .map((row) => ({ ...row, granted_by: row.granted_by && shown.has(row.granted_by) ? row.granted_by : null, revoked_by: row.revoked_by && shown.has(row.revoked_by) ? row.revoked_by : null })),
      useCases: data.useCases.filter((useCase) => myEntities.includes(useCase.entity ?? "")),
      federal: [],
    };
  }

  const cases = new Set(mine.flatMap((row) => row.use_case_id ? [row.use_case_id] : []));
  const senior = new Set(data.rows.filter((row) => !row.revoked_at && (row.role === "platform_admin" || row.role === "governance_admin")).map((row) => row.user_id));
  const colleagues = new Set(data.rows.filter((row) => !row.revoked_at && row.use_case_id && cases.has(row.use_case_id)).map((row) => row.user_id));
  const people = data.people.filter((person) => person.id === userId || (colleagues.has(person.id)
    && !federalIds.has(person.id) && !senior.has(person.id) && person.legacy_role !== "admin" && person.legacy_role !== "platform"));
  const visible = new Set(people.map((person) => person.id));
  return {
    mayManage, federalMember, people, entityAdminOf: [] as string[],
    rows: data.rows.filter((row) => row.user_id === userId || (visible.has(row.user_id) && row.use_case_id && cases.has(row.use_case_id)))
      .map((row) => ({ ...row, granted_by: row.granted_by && visible.has(row.granted_by) ? row.granted_by : null, revoked_by: row.revoked_by && visible.has(row.revoked_by) ? row.revoked_by : null })),
    useCases: data.useCases.filter((useCase) => cases.has(useCase.id)),
    federal: [],
  };
}
