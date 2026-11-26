import { positionOfRole, type Holder, type Position } from "./raci.ts";
import type { RoleId } from "./authz.ts";
import { ROLES } from "./authz.ts";

// Who holds which position where an event happened. Pure: no I/O. A position is held through a role assignment that reaches the event's place (the whole
// organisation, its country, its entity, or its use case), or, for the platform position, through a stored administrator or platform login.

export interface RoutePerson { id: string; legacy_role: string | null }
export interface RouteAssignment { user_id: string; role: string; use_case_id: string | null; scope_entity?: string | null; scope_country?: string | null; revoked_at?: string | null }
export interface Place { entity?: string | null; country?: string | null; use_case_id?: string | null }

const reaches = (a: RouteAssignment, p: Place): boolean => {
  if (a.use_case_id) return !!p.use_case_id && a.use_case_id === p.use_case_id;
  if (a.scope_entity) return !!p.entity && a.scope_entity === p.entity && (!a.scope_country || !p.country || a.scope_country === p.country);
  if (a.scope_country) return !!p.country && a.scope_country === p.country;
  return true;
};

export function holdersOf(people: RoutePerson[], assignments: RouteAssignment[], place: Place): Holder[] {
  const by = new Map<string, Set<Position>>();
  const add = (id: string, p: Position | null) => { if (p) (by.get(id) ?? by.set(id, new Set()).get(id)!).add(p); };
  for (const person of people) if (person.legacy_role === "admin" || person.legacy_role === "platform") add(person.id, "platform");
  for (const a of assignments) {
    if (a.revoked_at || !(ROLES as readonly string[]).includes(a.role) || !reaches(a, place)) continue;
    add(a.user_id, positionOfRole(a.role as RoleId));
  }
  return [...by.entries()].map(([user_id, set]) => ({ user_id, positions: [...set] }));
}
