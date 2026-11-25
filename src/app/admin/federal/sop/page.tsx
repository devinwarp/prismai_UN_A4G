import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { requireFederalToolAccess } from "@/lib/un/federal-read-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { countryHref, type CountryQuery } from "@/lib/un/country-context";
import { loadCountrySop } from "@/lib/un/federal-country";
import { loadSamples } from "@/lib/un/sop/data";
import { loadUseCaseSopDocument } from "@/lib/un/sop-version-store";
import AdminHeader from "../../AdminHeader";
import LangShell, { LangBar, T } from "../_components/Lang";
import SopWorkbench from "./SopWorkbench";
import "./[id]/reader.css";

export const metadata: Metadata = { title: "From a procedure to a use case", robots: { index: false, follow: false } };

export default async function SopPage({ searchParams }: { searchParams: Promise<CountryQuery> }) {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal/sop");
  if (!profile?.org_id) redirect("/login");
  const { browseCountries } = await requireFederalToolAccess(profile.org_id, user.id, profile.role);
  const { data: org } = await createAdminClient().from("organizations").select("name").eq("id", profile.org_id).maybeSingle();
  const { country, entities, uc02 } = await loadCountrySop(profile.org_id, (await searchParams).country, browseCountries);
  const document = uc02 ? await loadUseCaseSopDocument(profile.org_id, uc02) : null;
  const samples = loadSamples(country.currency ?? null, !uc02).map(({ input, analysis }) => {
    // Open the use-case reader only if it is showing the same document as intake.
    const matchesReader = (document?.attachedId ?? document?.sampleId) === input.sop_id
      && (document?.attached?.body ?? document?.sample?.text) === input.text;
    return {
      id: input.sop_id, title: input.title, text: input.text, analysis,
      readerHref: uc02 && matchesReader ? countryHref(`/admin/federal/sop/${uc02.id}`, country.id) : undefined,
    };
  });
  const canEdit = profile.role === "admin";

  return (
    <div className="sop-reader-shell conduit-bg flex flex-col">
      <div className="shrink-0 print:hidden"><AdminHeader active="federal" orgName={org?.name} viewer={profile.role === "viewer"} dense /></div>
      <LangShell bare>
        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pt-4 sm:px-6 desk:min-h-0 desk:max-w-[108rem]">
          <nav aria-label="Prism" className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 text-sm print:hidden short:mb-2">
            <Link href={countryHref("/admin/federal", country.id)} className="underline"><T k="sop.back" en="Back to the dashboard" /></Link>
            <div className="flex flex-wrap items-center gap-2"><span className="text-ink-soft">{country.name}</span><LangBar /></div>
          </nav>
          <SopWorkbench key={country.id} samples={samples} canEdit={canEdit} uc02Id={uc02?.id} country={country.id} entities={entities} />
        </main>
      </LangShell>
    </div>
  );
}
