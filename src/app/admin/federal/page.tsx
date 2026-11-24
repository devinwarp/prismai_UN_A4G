import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { appCountryDeps } from "@/lib/un/country-app";
import { loadState } from "@/lib/un/country-actions";
import { allCountries, countryIn, entityUseCases } from "@/lib/un/country";
import { computeDashboard } from "@/lib/un/model";
import { effectiveGates } from "@/lib/un/gates";
import { factsOf, loadGov } from "@/lib/un/gates-store";
import { loadJourneys } from "@/lib/un/journey-store";
import { loadHitlConfig, loadPolicy, loadUnUseCases } from "@/lib/un/store";
import AdminHeader from "../AdminHeader";
import LangShell, { T, TV } from "./_components/Lang";
import { DeadlineNote } from "./_components/Deadline";
import CitizenMessageCheck from "./_components/CitizenMessageCheck";
import Link from "next/link";
import FederalPanel from "./FederalPanel";

// The dashboard depends on the active country, which changes at any time: never prerender it
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Federal dashboard",
  robots: { index: false, follow: false },
};

export default async function FederalPage() {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal");
  if (!profile?.org_id) redirect("/login");

  const [{ data: org }, policy, useCases, hitl, gov] = await Promise.all([
    createAdminClient().from("organizations").select("name").eq("id", profile.org_id).maybeSingle(),
    loadPolicy(profile.org_id),
    loadUnUseCases(profile.org_id),
    loadHitlConfig(profile.org_id),
    loadGov(profile.org_id),
  ]);
  const gatesAdded = Object.fromEntries(useCases.map((u) => [u.ext_id, effectiveGates({ ext: u.ext_id, facts: factsOf(u), gov }).added.length]));
  // The dashboard counts only the entities linked to the active country (the country switch in the header); every entity is UAE until an admin links it elsewhere.
  const cs = await loadState(appCountryDeps(profile.org_id)).then((r) => r.state).catch(() => null);
  const active = (cs && countryIn(cs, cs.active.country)) || allCountries({ countries: {} })[0];
  const scoped = cs ? entityUseCases(cs, useCases, active.id) : useCases;
  // The framework policy on file (its name, target and deadline) is the UAE federal one. No other country has a target recorded yet, so none is shown for it.
  const hasTarget = active.id === "UAE";
  const shown = hasTarget ? policy : { ...policy, name: `${active.name}: agentic AI deployment`, jurisdiction: active.name, source_url: null, deadline: null };
  const dashboard = computeDashboard(shown, scoped);
  const journeys = Object.fromEntries(await loadJourneys(profile.org_id, scoped));

  return (
    <div className="conduit-bg min-h-dvh">
      <AdminHeader active="federal" orgName={org?.name} viewer={profile.role === "viewer"} country />
      <LangShell>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase">
          <T k="page.federal" en="Federal dashboard" />
        </p>
        <h1 className="font-display mt-2 text-3xl font-medium tracking-tight sm:text-4xl">
          {shown.name}
        </h1>
        <p className="mt-2 max-w-[68ch] text-sm text-ink-soft">
          {hasTarget
            ? <>{shown.jurisdiction} · <TV k="ua.pg.sub" en="{p}% of use cases deployed" v={{ p: shown.target_percent }} /><DeadlineNote policy={shown} /></>
            : <>{shown.jurisdiction} · <T k="ua.pg.notarget" en="No framework target is recorded for this country yet." /></>}
        </p>
        {scoped.length === 0 ? (
          <section className="mt-6 max-w-[68ch] rounded-xl border border-line bg-paper-deep p-5" data-testid="no-entities">
            <p className="font-medium"><TV k="ua.pg.noent" en="No entities are linked to {c} yet." v={{ c: active.name }} /></p>
            <p className="mt-1 text-sm text-ink-soft"><T k="ua.pg.noent.h" en="This dashboard counts only the use cases of entities linked to the active country. Link an entity to it, and its numbers appear here." /></p>
            <p className="mt-3 text-sm"><Link href="/admin/federal/goals" className="underline"><T k="ua.pg.noent.go" en="Link an entity to this country" /></Link></p>
          </section>
        ) : (
        <FederalPanel
          noTarget={!hasTarget}
          policy={shown}
          dashboard={dashboard}
          useCases={scoped}
          canEdit={profile.role === "admin"}
          hitl={hitl}
          gatesAdded={gatesAdded}
          journeys={journeys}
          asOf={new Date().toISOString()}
        />
        )}
        <CitizenMessageCheck />
      </main>
      </LangShell>
    </div>
  );
}
