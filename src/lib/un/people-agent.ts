import type { RoleId } from "./authz.ts";
import { holdersOfTitle } from "./authz.ts";

// The People agent's rules: after an SOP's job profiles are derived, which positions has nobody got? Pure: no I/O. The agent links people to job profiles by
// job title (the same case-insensitive match the approver lists use); a position nobody holds becomes an item for the entity admin (action) and the platform
// admin (information), or for the platform admin as an action when the entity has no admin. A person decides; the agent never makes an account.

export interface NeedUseCase { id: string; ext_id: string; entity: string; title: string }
export interface NeedAssignment { user_id: string; role: string; use_case_id: string | null; scope_entity?: string | null; scope_country?: string | null; revoked_at?: string | null }
export interface NeedPerson { id: string; job_title: string | null }

export type NeedKind = "process_owner" | "operator" | "job_profile";
export interface PositionNeed {
  kind: NeedKind;
  /** the position to fill: "Process owner", "Operator" or the SOP's job profile name */
  title: string;
  use_case_id: string;
  ext_id: string;
  entity: string;
  /** the stable key: one open item per position of a use case */
  key: string;
}

const live = (a: NeedAssignment) => !a.revoked_at;

/** Does this assignment of `role` reach this use case (held for it, for its entity, or for the whole organisation)? */
const reaches = (a: NeedAssignment, role: RoleId, uc: NeedUseCase): boolean =>
  live(a) && a.role === role && (a.use_case_id === uc.id || (!a.use_case_id && !a.scope_entity && !a.scope_country) || a.scope_entity === uc.entity);

/**
 * The positions nobody holds. A use case needs a process owner and an operator (a role assignment that reaches it), and, for each job profile ticked for
 * automation, someone whose job title is that profile's name.
 */
export function missingPositions(o: { useCases: NeedUseCase[]; assignments: NeedAssignment[]; people: NeedPerson[]; profileTitles?: Record<string, string[]> }): PositionNeed[] {
  const out: PositionNeed[] = [];
  for (const uc of o.useCases) {
    const need = (kind: NeedKind, title: string): PositionNeed => ({ kind, title, use_case_id: uc.id, ext_id: uc.ext_id, entity: uc.entity, key: `${kind}:${uc.id}:${title.toLowerCase()}` });
    if (!o.assignments.some((a) => reaches(a, "process_owner", uc))) out.push(need("process_owner", "Process owner"));
    if (!o.assignments.some((a) => reaches(a, "operator", uc))) out.push(need("operator", "Operator"));
    for (const title of o.profileTitles?.[uc.id] ?? []) {
      if (holdersOfTitle(o.people.map((p) => ({ id: p.id, job_title: p.job_title })), title).length === 0) out.push(need("job_profile", title));
    }
  }
  return out;
}

/** Countries that have entities but no governance admin (held for the country or for the whole organisation). The requirement is mandatory: adding an
 * entity to a country needs a governance admin there. */
export function countriesNeedingGovernanceAdmin(o: { countriesWithEntities: string[]; assignments: NeedAssignment[] }): string[] {
  const has = (country: string) => o.assignments.some((a) => live(a) && a.role === "governance_admin" && (a.scope_country === country || (!a.scope_country && !a.scope_entity && !a.use_case_id)));
  return [...new Set(o.countriesWithEntities)].filter((c) => !has(c)).sort();
}

export const needSubject = (n: PositionNeed) =>
  n.kind === "job_profile" ? `Create a user for the position "${n.title}" (${n.ext_id}, ${n.entity})` : `Appoint ${/^[aeiou]/i.test(n.title) ? "an" : "a"} ${n.title.toLowerCase()} for ${n.ext_id} (${n.entity})`;
