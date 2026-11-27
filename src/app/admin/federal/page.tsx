import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { appCountryDeps } from "@/lib/un/country-app";
import { entityRegistrationReady, loadState } from "@/lib/un/country-actions";
import type { CountryQuery } from "@/lib/un/country-context";
import { federalCountryOf } from "@/lib/un/federal-country";
import { allCountries, entityCountryOf, entityUseCases, inScope, visibleCountries } from "@/lib/un/country";
import { loadChunks } from "@/lib/un/kb";
import { computeDashboard } from "@/lib/un/model";
import { effectiveGates } from "@/lib/un/gates";
import { factsOf, loadGov } from "@/lib/un/gates-store";
import { loadJourneyDetails } from "@/lib/un/journey-store";
import { sampleSopIdForUseCase } from "@/lib/un/sop/data";
import { loadEntityRows } from "@/lib/un/entity-store";
import { loadEntityOverview } from "@/lib/un/target-store";
import { ENTITY_GOALS, hasMeasuredGoals } from "@/lib/un/goals";
import { permissionsFor } from "@/lib/un/permissions-server";
import { buttonFor } from "@/lib/un/rerun";
import { loadRerunView } from "@/lib/un/rerun-store";
import { loadPeople } from "@/lib/un/roles-store";
import { loadPolicy, loadUnUseCases } from "@/lib/un/store";
import AdminHeader from "../AdminHeader";
import LangShell, { T, TV } from "./_components/Lang";
import { DeadlineNote } from "./_components/Deadline";
import FederalPanel from "./FederalPanel";
import { loadFederalReadAccess } from "@/lib/un/federal-read-access";
import { canCompareCountries } from "@/lib/un/people-directory";
import { countriesNeedingGovernanceAdmin } from "@/lib/un/people-agent";
import { loadAssignmentRows } from "@/lib/un/roles-store";

// The dashboard depends on the active country, which changes at any time: never prerender it
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Federal dashboard",
  robots: { index: false, follow: false },
};

export default async function FederalPage({ searchParams }: { searchParams: Promise<CountryQuery> }) {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal");
  if (!profile?.org_id) redirect("/login");

  const [{ data: org }, policy, useCases, gov] = await Promise.all([
    createAdminClient().from("organizations").select("name").eq("id", profile.org_id).maybeSingle(),
    loadPolicy(profile.org_id),
    loadUnUseCases(profile.org_id),
    loadGov(profile.org_id),
  ]);
  // The dashboard counts only the entities linked to the active country (the country switch in the header); every entity is UAE until an admin links it elsewhere.
  const deps = appCountryDeps(profile.org_id);
  const loaded = await loadState(deps).catch(() => null);
  const cs = loaded?.state ?? null;
  const [{ country, entity }, access] = await Promise.all([searchParams, loadFederalReadAccess(profile.org_id, user.id, profile.role)]);
  const preferred = cs ? federalCountryOf(cs, country, access.browseCountries) : allCountries({ countries: {} })[0];
  const assigned = cs && !access.allCases
    ? new Set(useCases.filter((u) => access.caseIds.has(u.id)).map((u) => entityCountryOf(cs, u.entity))) : undefined;
  const active = cs && assigned && !assigned.has(preferred.id)
    ? visibleCountries(cs).find((c) => assigned.has(c.id)) ?? preferred : preferred;
  // A country preview leaves the workspace run context in place.
  const preview = cs && active.id !== cs.active.country ? active : undefined;
  // a hidden entity (an admin hid it on the goals screen) is left out of the counts
  const [entities, countryReady] = await Promise.all([
    loadEntityRows(profile.org_id).catch(() => []),
    cs && access.allCases ? entityRegistrationReady(deps, cs, active).catch(() => false) : false,
  ]);
  const hiddenEntities = new Set(entities.filter((entry) => entry.hidden).map((entry) => entry.name));
  const scoped = (cs ? entityUseCases(cs, useCases, active.id) : useCases).filter((u) => !hiddenEntities.has(u.entity) && (access.allCases || access.caseIds.has(u.id)));
  // how many of each entity's use cases have an approved set of process targets (the setup strip's fourth step)
  const approvedTargets = new Map<string, number>(access.allCases ? (await loadEntityOverview(profile.org_id).catch(() => [])).map((e) => [e.name, e.use_cases.filter((u) => u.state?.approved).length] as [string, number]) : []);
  const setupEntities = access.allCases ? [...new Set([...scoped.map((u) => u.entity), ...entities.map((e) => e.name), ...Object.keys(ENTITY_GOALS)])]
    .filter((name) => !hiddenEntities.has(name) && (cs ? entityCountryOf(cs, name) === active.id : active.id === "UAE"))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const saved = entities.find((e) => e.name === name)?.goals;
      const goals = saved?.length ? saved : ENTITY_GOALS[name] ?? [];
      return { name, hasGoals: goals.length > 0, goalsReady: hasMeasuredGoals(goals), targetsApproved: (approvedTargets.get(name) ?? 0) };
    }) : [];
  const initialEntity = typeof entity === "string" && (setupEntities.some((e) => e.name === entity) || scoped.some((u) => u.entity === entity)) ? entity : "";
  const gatesAdded = Object.fromEntries(scoped.map((u) => [u.ext_id, effectiveGates({ ext: u.ext_id, facts: factsOf(u), gov }).added.length]));
  const activeHasKb = active.built === "precomputed" || (cs?.policies?.[active.id] != null);
  const kbStats = active.built === "precomputed" ? (() => {
    const cc = loadChunks().filter((c) => inScope(c, active));
    return { chunks: cc.length, sources: new Set(cc.map((c) => c.source_id)).size };
  })() : null;
  // The UAE's target is the framework policy on file (the organisation's policy row). Any other country has one only if an admin set it (the country log).
  const own = cs?.targets[active.id];
  const hasTarget = active.id === "UAE" || !!own;
  const shown = active.id === "UAE" ? policy : own ? { ...policy, ...own } : { ...policy, name: `${active.name}: agentic AI deployment`, jurisdiction: active.name, source_url: null, deadline: null };
  const dashboard = computeDashboard(shown, scoped);
  // a country with entities must have a governance admin: until one is appointed, the setup journey's country step is not done
  const governanceAppointed = !scoped.length || countriesNeedingGovernanceAdmin({ countriesWithEntities: [active.id], assignments: await loadAssignmentRows(profile.org_id) }).length === 0;
  const { journeys, attachedSopIds, automation } = await loadJourneyDetails(profile.org_id, scoped);
  const sops = Object.fromEntries(scoped.flatMap((u) => {
    const attached = attachedSopIds.get(u.id);
    const id = attached ?? sampleSopIdForUseCase(u);
    return id ? [[u.id, { id, sample: !attached }] as const] : [];
  }));
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
      <p className="mt-1 text-xs text-ink-soft">
          {kbStats
            ? <TV k="ua.pg.kb.badge" en="KB · {n} chunks · {s} sources" v={{ n: kbStats.chunks, s: kbStats.sources }} />
            : activeHasKb
              ? <T k="ua.pg.kb.badge.on" en="Knowledge base: ready" />
              : <T k="ua.pg.kb.none" en="Knowledge base: not built" />}
      </p>
      {/* One-screen desktop: the headline band's target line says the same (target, deadline) and the header names the country, so this line stays for a screen reader only. */}
      <p className="mt-2 max-w-[68ch] text-sm text-ink-soft desk:sr-only">
        {hasTarget
          ? <>{shown.jurisdiction} · <TV k="ua.pg.sub" en="{p}% of use cases deployed" v={{ p: shown.target_percent }} /><DeadlineNote policy={shown} /></>
          : <>{shown.jurisdiction} · <T k="ua.pg.notarget" en="No framework target is recorded for this country yet." /></>}
      </p>
    </>
  );
  const emptyState = scoped.length === 0 ? (
    <div className="border-t border-line p-5 desk:p-4" data-testid="no-entities">
      {!access.allCases ? (
        <p className="text-sm text-ink-soft"><T k="pe.noassigned" en="You have no visible use cases in this country." /></p>
      ) : <p className="text-sm text-ink-soft"><T k="setup.empty_register" en="No use cases are registered in this country yet." /></p>}
    </div>
  ) : undefined;

  return (
    <div className="conduit-bg flex min-h-dvh flex-col desk:h-dvh desk:overflow-hidden">
      <AdminHeader active="federal" orgName={org?.name} viewer={profile.role === "viewer"} country previewCountry={preview?.id} dense />
      <LangShell bare>
        <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 desk:flex desk:min-h-0 desk:max-w-[120rem] desk:flex-1 desk:flex-col desk:py-3">
          <FederalPanel
            key={active.id}
            lead={lead}
            emptyState={emptyState}
            noTarget={!hasTarget}
            countryId={active.id}
            canCompare={canCompareCountries(user.id, profile.role)}
            showFederalTools={access.allCases}
            countryReady={countryReady}
            governanceAppointed={governanceAppointed}
            policyReady={hasTarget}
            setupEntities={setupEntities}
            initialEntity={initialEntity}
            hasLicenceDemo={scoped.some((u) => sampleSopIdForUseCase(u))}
            policy={shown}
            dashboard={dashboard}
            useCases={scoped}
            canEdit={profile.role === "admin"}
            editableRisks={scoped.filter((uc) => perms.can("risk.edit", uc.id)).map((uc) => uc.id)}
            gatesAdded={gatesAdded}
            journeys={Object.fromEntries(journeys)}
            work={Object.fromEntries(automation)}
            sops={sops}
            rerun={rerun}
            asOf={new Date().toISOString()}
          />
        </main>
      </LangShell>
    </div>
  );
}
