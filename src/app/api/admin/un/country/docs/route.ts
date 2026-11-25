import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { policyDocsOf } from "@/lib/un/country-actions";
import { appCountryDeps } from "@/lib/un/country-app";

/** GET ?country=XX → the policy documents an admin pasted for a country created on the screen, so they can be edited and rebuilt. Admin only. */
export async function GET(request: Request) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  const country = new URL(request.url).searchParams.get("country") ?? "";
  try {
    const docs = await policyDocsOf(appCountryDeps(who.org_id!), country);
    if (!docs) return NextResponse.json({ error: "Only a country created on the screen has pasted policy documents." }, { status: 404 });
    return NextResponse.json({ docs }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
