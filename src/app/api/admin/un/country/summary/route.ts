import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { indexOfCountry, loadState } from "@/lib/un/country-actions";
import { appCountryDeps } from "@/lib/un/country-app";
import { COUNTRIES } from "@/lib/un/country";

/** GET → what the header's country switch needs: the active country, the countries, and what this caller may do (switch = admin, as on the
 * country route, which stays admin-only; manage people = users.manage). Read-only: any signed-in role. */
export async function GET() {
  const who = await requirePermission("view");
  if (who instanceof NextResponse) return who;
  try {
    const d = appCountryDeps(who.org_id!);
    const { state } = await loadState(d);
    const countries = await Promise.all(COUNTRIES.map(async (c) => ({ id: c.id, name: c.name, ready: !!(await indexOfCountry(d, state, c.id)), onDemand: c.built === "on_demand" })));
    return NextResponse.json({ active: state.active.country, countries, canSwitch: who.role === "admin", canManagePeople: who.decide("users.manage").ok });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
