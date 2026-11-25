import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { indexOfCountry, loadState } from "@/lib/un/country-actions";
import { appCountryDeps } from "@/lib/un/country-app";
import { entityCountryOf, visibleCountries } from "@/lib/un/country";
import { loadFederalReadAccess } from "@/lib/un/federal-read-access";
import { loadUseCaseChoices } from "@/lib/un/roles-store";

/** GET → what the header's country switch needs: the active country, the countries, and what this caller may do (switch = admin, as on the
 * country route, which stays admin-only; manage people = users.manage). Read-only: any signed-in role. */
export async function GET() {
  const who = await requirePermission("view");
  if (who instanceof NextResponse) return who;
  try {
    const d = appCountryDeps(who.org_id!);
    const { state } = await loadState(d);
    // a hidden country is not offered by the switch (an admin unhides it on the country screen)
    const access = await loadFederalReadAccess(who.org_id!, who.id, who.role);
    const assigned = access.allCases ? null : new Set((await loadUseCaseChoices(who.org_id!)).filter((uc) => access.caseIds.has(uc.id)).map((uc) => entityCountryOf(state, uc.entity)));
    const countries = await Promise.all(visibleCountries(state).filter((c) => !assigned || assigned.has(c.id)).map(async (c) => ({ id: c.id, name: c.name, ready: !!(await indexOfCountry(d, state, c.id)), onDemand: c.built === "on_demand", custom: !!c.custom })));
    const active = countries.some((c) => c.id === state.active.country) ? state.active.country : countries[0]?.id ?? state.active.country;
    return NextResponse.json({ active, countries, canSwitch: who.role === "admin", canBrowse: access.browseCountries, canViewPeople: true, canManagePeople: who.decide("users.manage").ok });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
