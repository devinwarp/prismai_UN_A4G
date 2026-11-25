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
import { loadHiddenEntities } from "@/lib/un/entity-store";
import { permissionsFor } from "@/lib/un/permissions-server";
import { buttonFor } from "@/lib/un/rerun";
import { loadRerunView } from "@/lib/un/rerun-store";
import { loadPeople } from "@/lib/un/roles-store";
import { loadHitlConfig, loadPolicy, loadUnUseCases } from "@/lib/un/store";
import AdminHeader from "../AdminHeader";
import LangShell, { LangBar, T, TV } from "./_components/Lang";
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
  const loaded = await loadState(appCountryDeps(profile.org_id)).catch(() => null);
  const cs = loaded?.state ?? null;
  const active = (cs && countryIn(cs, cs.active.country)) || allCountries({ countries: {} })[0];
  // a hidden entity (an admin hid it on the goals screen) is left out of the counts
  const hiddenEntities = await loadHiddenEntities(profile.org_id);
  const scoped = (cs ? entityUseCases(cs, useCases, active.id) : useCases).filter((u) => !hiddenEntities.has(u.entity));
  // The UAE's target is the framework policy on file (the organisation's policy row). Any other country has one only if an admin set it (the country log).
  const own = cs?.targets[active.id];
  const hasTarget = active.id === "UAE" || !!own;
  const shown = active.id === "UAE" ? policy : own ? { ...policy, ...own } : { ...policy, name: `${active.name}: agentic AI deployment`, jurisdiction: active.name, source_url: null, deadline: null };
  const dashboard = computeDashboard(shown, scoped);
  const journeys = Object.fromEntries(await loadJourneys(profile.org_id, scoped));
  // The rerun icon of each row: whether there is an earlier run to repeat, whether a deployed use case has a request from its process owner, whether
  // the rules or SOP changed since its last run, and what this person may do (the same checks the route makes).
  const perms = await permissionsFor(profile, user.id);
  const people = await loadPeople(profile.org_id).catch(() => []);
  const rv = await loadRerunView(profile.org_id, scoped, { log: loaded?.entries ?? [], countryOf: () => active.id }).catch(() => ({}) as Awaited<ReturnType<typeof loadRerunView>>);
  const rerun = Object.fromEntries(scoped.map((u) => {
    const s = rv[u.id] ?? { hasRun: false, lastRunAt: null, open: null, stale: null };
    return [u.id, {
      button: buttonFor(u.stage, s), stale: !!s.stale, canRun: perms.can("rerun.run", u.id), canRequest: perms.can("rerun.request", u.id),
      request: s.open ? { by: s.open.requested_email ?? people.find((p) => p.id === s.open!.requested_by)?.email ?? s.open.requested_by, at: s.open.requested_at, reason: s.open.reason } : null,
    }];
  }));

  // The page identity is the policy's name; "Federal dashboard" stays for a screen reader (the header nav carries it for everyone else).
  const lead = (
    <>
      <h1 className="font-display text-3xl font-medium tracking-tight sm:text-4xl desk:truncate desk:text-2xl">
        <span className="sr-only"><T k="page.federal" en="Federal dashboard" />: </span>{shown.name}
      </h1>
      {/* One-screen desktop: the headline band's target line says the same (target, deadline) and the header names the country, so this line stays for a screen reader only. */}
      <p className="mt-2 max-w-[68ch] text-sm text-ink-soft desk:sr-only">
        {hasTarget
          ? <>{shown.jurisdiction} · <TV k="ua.pg.sub" en="{p}% of use cases deployed" v={{ p: shown.target_percent }} /><DeadlineNote policy={shown} /></>
          : <>{shown.jurisdiction} · <T k="ua.pg.notarget" en="No framework target is recorded for this country yet." /></>}
      </p>
    </>
  );
  const dash = scoped.length > 0;

  return (
    // With a dashboard to show, a desktop-sized window is exactly one screen tall and the page itself never scrolls (the register scrolls inside its panel).
    <div className={`conduit-bg flex min-h-dvh flex-col ${dash ? "desk:h-dvh desk:overflow-hidden" : ""}`}>
      <AdminHeader active="federal" orgName={org?.name} viewer={profile.role === "viewer"} country dense={dash} />
      <LangShell bare>
      <main className={`mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 ${dash ? "desk:flex desk:min-h-0 desk:max-w-[120rem] desk:flex-1 desk:flex-col desk:py-3" : ""}`}>
        {!dash && (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>{lead}</div>
              <div className="flex items-center gap-2"><LangBar /></div>
            </div>
            <section className="mt-6 max-w-[68ch] rounded-xl border border-line bg-paper-deep p-5" data-testid="no-entities">
              <p className="font-medium"><TV k="ua.pg.noent" en="No entities are linked to {c} yet." v={{ c: active.name }} /></p>
              <p className="mt-1 text-sm text-ink-soft"><T k="ua.pg.noent.h" en="This dashboard counts only the use cases of entities linked to the active country. Link an entity to it, and its numbers appear here." /></p>
              <p className="mt-3 text-sm"><Link href="/admin/federal/goals" className="underline"><T k="ua.pg.noent.go" en="Link an entity to this country" /></Link></p>
            </section>
            <CitizenMessageCheck />
          </>
        )}
        {dash && (
          <FederalPanel
            lead={lead}
            noTarget={!hasTarget}
            countryId={active.id}
            policy={shown}
            dashboard={dashboard}
            useCases={scoped}
            canEdit={profile.role === "admin"}
            hitl={hitl}
            gatesAdded={gatesAdded}
            journeys={journeys}
            rerun={rerun}
            asOf={new Date().toISOString()}
          />
        )}
      </main>
      </LangShell>
    </div>
  );
}
