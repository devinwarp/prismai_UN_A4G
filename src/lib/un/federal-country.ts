import { countryIn, countryOf, DEFAULT_ENTITY_COUNTRY, entityCountryOf, entityUseCases, type CountryState } from "@/lib/un/country";
import { loadState } from "@/lib/un/country-actions";
import { appCountryDeps } from "@/lib/un/country-app";
import { loadUnUseCases } from "@/lib/un/store";
import { loadEntityRows } from "@/lib/un/entity-store";
import { sampleSopIdForUseCase } from "@/lib/un/sop/data";

export function federalCountryOf(state: CountryState, requested: unknown, canSelect: boolean) {
  const selected = canSelect && typeof requested === "string" ? countryIn(state, requested) : undefined;
  return selected && !selected.hidden ? selected : countryIn(state, state.active.country) ?? countryOf(DEFAULT_ENTITY_COUNTRY)!;
}

export async function loadFederalCountry(orgId: string, requested: unknown, canSelect: boolean) {
  const deps = appCountryDeps(orgId);
  const { state } = await loadState(deps);
  return { deps, state, country: federalCountryOf(state, requested, canSelect) };
}

async function loadCountryPortfolio(orgId: string, state: CountryState, country: string) {
  const [cases, entities] = await Promise.all([loadUnUseCases(orgId), loadEntityRows(orgId)]);
  const hidden = new Set(entities.filter((e) => e.hidden).map((e) => e.name));
  return { rows: entities, cases: entityUseCases(state, cases, country).filter((u) => !hidden.has(u.entity)) };
}

export async function loadCountryUseCases(orgId: string, state: CountryState, country: string) {
  return (await loadCountryPortfolio(orgId, state, country)).cases;
}

export async function loadCountrySop(orgId: string, requested: unknown, canSelect: boolean) {
  const { state, country } = await loadFederalCountry(orgId, requested, canSelect);
  const { cases, rows } = await loadCountryPortfolio(orgId, state, country.id);
  const entities = [...new Set([...cases.map((u) => u.entity), ...rows.filter((e) => !e.hidden && entityCountryOf(state, e.name) === country.id).map((e) => e.name)])].sort();
  const uc02 = cases.find((u) => sampleSopIdForUseCase(u));
  return { state, country, entities, uc02 };
}
