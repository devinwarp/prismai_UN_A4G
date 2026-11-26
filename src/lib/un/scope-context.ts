import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadState } from "./country-actions";
import { appCountryDeps } from "./country-app";
import { entityCountryOf, DEFAULT_ENTITY_COUNTRY } from "./country";
import type { Context } from "./authz";

// Where an action happens, for the permission check: a use case, the entity it belongs to, and the country that entity is linked to. Roles held for a
// country or an entity are matched against this (authz.ts). An entity is in one country (the link in the country log; UAE until an admin moves it).

/** The country state of an organisation, read once per request. If it cannot be read the default country applies: the narrow scopes then match only
 * the default country, never more. */
const countryState = cache(async (orgId: string) => loadState(appCountryDeps(orgId)).then((r) => r.state).catch(() => null));

export async function countryOfEntity(orgId: string, entity: string): Promise<string> {
  const state = await countryState(orgId);
  return state ? entityCountryOf(state, entity) : DEFAULT_ENTITY_COUNTRY;
}

/** The context of an entity: its name and its country. */
export async function contextOfEntity(orgId: string, entity: string): Promise<Context> {
  return { entity, country: await countryOfEntity(orgId, entity) };
}

/** The context of a use case: itself, its entity and that entity's country. A use case that cannot be found has no entity, so entity and country
 * scopes do not reach it. */
export async function contextOfUseCase(orgId: string, useCaseId: string): Promise<Context> {
  const { data } = await createAdminClient().from("un_use_cases").select("entity").eq("org_id", orgId).eq("id", useCaseId).maybeSingle();
  const entity = (data as { entity?: string } | null)?.entity;
  return entity ? { use_case_id: useCaseId, entity, country: await countryOfEntity(orgId, entity) } : { use_case_id: useCaseId };
}

export interface ScopeIndex {
  /** the context of a use case, or just its id when it is unknown */
  useCase: (id: string) => Context;
  entity: (name: string) => Context;
}

/** The contexts of every use case and entity of the organisation, for a page that checks several rows: one read of the use cases and one of the country state. */
export async function scopeIndex(orgId: string): Promise<ScopeIndex> {
  const { data } = await createAdminClient().from("un_use_cases").select("id, entity").eq("org_id", orgId);
  const state = await countryState(orgId);
  const countryOf = (entity: string) => (state ? entityCountryOf(state, entity) : DEFAULT_ENTITY_COUNTRY);
  const byId = new Map<string, Context>();
  for (const r of (data ?? []) as { id: string; entity: string }[]) byId.set(r.id, { use_case_id: r.id, entity: r.entity, country: countryOf(r.entity) });
  return { useCase: (id) => byId.get(id) ?? { use_case_id: id }, entity: (name) => ({ entity: name, country: countryOf(name) }) };
}
