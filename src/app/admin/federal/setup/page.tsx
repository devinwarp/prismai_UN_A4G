import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { entityRegistrationReady, indexOfCountry } from "@/lib/un/country-actions";
import { countryHref, type CountryQuery } from "@/lib/un/country-context";
import { allCountries, entityCountryOf, visibleCountries } from "@/lib/un/country";
import { loadFederalCountry } from "@/lib/un/federal-country";
import { loadFederalReadAccess } from "@/lib/un/federal-read-access";
import { hasMeasuredGoals } from "@/lib/un/goals";
import { countriesNeedingGovernanceAdmin } from "@/lib/un/people-agent";
import { permissionsFor } from "@/lib/un/permissions-server";
import { RULESETS } from "@/lib/un/rulesets";
import { loadAssignmentRows, loadPeople } from "@/lib/un/roles-store";
import { setupProgress, type SetupStepId } from "@/lib/un/setup-progress";
import { loadAttachment, loadSopIntakeSummaries, profilesForUseCase } from "@/lib/un/sop-version-store";
import { loadJourneyDetails } from "@/lib/un/journey-store";
import { loadAttachedSop, loadProfileRows } from "@/lib/un/profiles-store";
import { checkSopKbFor } from "@/lib/un/sop-kb-app";
import { loadPolicy, loadUnUseCases } from "@/lib/un/store";
import { loadEntityOverview, loadGoalsResolved, loadTargetLog } from "@/lib/un/target-store";
import { loadEntityRows } from "@/lib/un/entity-store";
import { approversForUseCase } from "@/lib/un/approvers-store";
import { withGovernance } from "@/lib/un/approvers";
import { controlsOf, coverage, describeTarget, EMPTY_TARGETS, replayTargets, verifyTargets, type TargetEntry } from "@/lib/un/targets";
import { AddEntity, EntityTools } from "../goals/EntityAdmin";
import { EntityCountry, LinkEntity } from "../goals/EntityCountry";
import { CountryPanel } from "../country/CountryPanel";
import { TargetsEditor } from "../use-cases/[id]/targets/TargetsEditor";
import ImportCsv from "../_components/ImportCsv";
import SopIntake from "../_components/SopIntake";
import AutomationConfirm, { type AutomationRow } from "./AutomationConfirm";
import SetupSection, { SetupBar } from "../_components/SetupSection";
import ToolWorkspace from "../_components/ToolWorkspace";
import { scrollRegion } from "../_components/ui";
import CountryPolicy from "../country/CountryPolicy";
import { T, TV } from "../_components/Lang";
import GovernanceAdmin from "./GovernanceAdmin";

export const metadata: Metadata = { title: "Setup", robots: { index: false, follow: false } };

// setup changes at any time: never prerender it
export const dynamic = "force-dynamic";

type Query = CountryQuery & { step?: string; uc?: string };
const STEP_TITLE_TEXT: Record<SetupStepId, string> = { country: "Country setup", goals: "Entity goals and measures", cases: "Use cases", targets: "Process targets", sop: "SOP intake" };

/** Everything a person has to supply, in order, on one page. After it, the person is involved only when an approval reaches them as a notification:
 * the targets agent has already drafted the process targets, and they edit and approve them here or from the inbox. */
export default async function SetupPage({ searchParams }: { searchParams: Promise<Query> }) {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal/setup");
  if (!profile?.org_id) redirect("/login");
  const orgId = profile.org_id;
  // not requireFederalToolAccess: a role held for one country, entity or use case (the governance admin who approves targets, a process owner)
  // has no access to every case, and the notification they follow must still open. They see only the use cases they can read.
  const access = await loadFederalReadAccess(orgId, user.id, profile.role);
  const { browseCountries } = access;
  const mayRead = (id: string) => access.allCases || access.caseIds.has(id);
  const q = await searchParams;
  const { country, state, deps } = await loadFederalCountry(orgId, q.country, browseCountries);
  const canEdit = profile.role === "admin";

  const [overview, entityRows, assignmentRows, people, { data: org }, registrationReady, useCases] = await Promise.all([
    loadEntityOverview(orgId), loadEntityRows(orgId).catch(() => []), loadAssignmentRows(orgId).catch(() => []), loadPeople(orgId).catch(() => []),
    createAdminClient().from("organizations").select("name").eq("id", orgId).maybeSingle(),
    entityRegistrationReady(deps, state, country).catch(() => false), loadUnUseCases(orgId),
  ]);
  const hidden = new Set(entityRows.filter((r) => r.hidden).map((r) => r.name));
  const entities = overview.filter((e) => entityCountryOf(state, e.name) === country.id && !hidden.has(e.name) && (access.allCases || e.use_cases.some((u) => mayRead(u.id))));
  const entity = entities.find((e) => e.name === q.entity) ?? entities[0];
  // the rest of what the goals screen managed: entities hidden in this country (to unhide), entities of other countries (to link here), and the country list
  const hiddenHere = canEdit ? overview.filter((e) => entityCountryOf(state, e.name) === country.id && hidden.has(e.name)) : [];
  const linkable = overview.filter((e) => !hidden.has(e.name) && entityCountryOf(state, e.name) !== country.id).map((e) => e.name);
  const countryList = visibleCountries(state).map((c) => ({ id: c.id, name: c.name }));
  const cases = entity ? useCases.filter((u) => u.entity === entity.name && mayRead(u.id)).sort((a, b) => a.ext_id.localeCompare(b.ext_id)) : [];
  const intake = await loadSopIntakeSummaries(orgId, cases.map((c) => c.id));
  // each use case's SOP stage (the journey's first): attached, knowledge base ready, a profile ticked, skills built. The SOP step is done only when it is.
  const { journeys } = await loadJourneyDetails(orgId, cases);
  const sopReady = cases.filter((c) => journeys.get(c.id)?.stages[0]?.state === "done").length;
  // the job profiles of each attached SOP with their ticks, for the automation choice at the end of the SOP step
  const automation: AutomationRow[] = await Promise.all(cases.map(async (c): Promise<AutomationRow> => {
    const base = { id: c.id, code: c.ext_id, title: c.title, frozen: c.stage === "deployed" };
    const sopId = await loadAttachedSop(orgId, c.id).catch(() => null);
    if (!sopId) return { ...base, kb: null, profiles: [] };
    const version = (await loadAttachment(orgId, c.id).catch(() => null))?.version ?? 1;
    const [profiles, ticks, kb] = await Promise.all([profilesForUseCase(orgId, c.id, sopId).catch(() => null), loadProfileRows(orgId, c.id, sopId).catch(() => []), checkSopKbFor(orgId, sopId, version).catch(() => ({ ok: false, reason: "The knowledge base could not be checked." }))]);
    return { ...base, kb, profiles: (profiles ?? []).map((p) => {
      const tick = ticks.find((r) => r.profile === p.name);
      return { name: p.name, tasks: p.tasks.length, clientFacing: !!p.flags.client_facing, affectsRights: !!p.flags.affects_rights, irreversible: !!p.flags.irreversible, automate: !!tick?.automate, skill: !!tick?.skill_sha256 };
    }) };
  }));
  const governanceAppointed = countriesNeedingGovernanceAdmin({ countriesWithEntities: [country.id], assignments: assignmentRows }).length === 0;
  const coverageCases = (entity?.use_cases ?? []).filter((u) => mayRead(u.id));
  const targetStates = new Map((entity?.use_cases ?? []).map((u) => [u.id, u.state]));

  // the country's policy target (the share of use cases to deploy, and by when): the UAE always has one, any other country once an admin sets it
  const countryTarget = state.targets[country.id];
  const policyReady = country.id === "UAE" || !!countryTarget;
  const basePolicy = canEdit ? await loadPolicy(orgId) : null;
  const countryPolicy = basePolicy && (country.id === "UAE" ? basePolicy : {
    ...basePolicy, ...(countryTarget ?? { name: `${country.name}: agentic AI deployment`, jurisdiction: country.name, source_url: null, deadline: null }),
  });
  const progress = setupProgress({
    countryReady: registrationReady, policyReady, governanceAppointed,
    goalsReady: !!entity && hasMeasuredGoals(entity.goals),
    cases: cases.length,
    targetsApproved: cases.filter((c) => targetStates.get(c.id)?.approved).length,
    targetsProposed: cases.filter((c) => targetStates.get(c.id)?.pending).length,
    attached: cases.filter((c) => intake[c.id]).length,
    sopReady,
  });
  const stateOf = (id: SetupStepId) => progress.steps.find((s) => s.id === id)!;
  const count = (id: SetupStepId) => { const c = stateOf(id).count; return c ? `${c.done}/${c.of}` : undefined; };
  // a locked step names the step it waits for
  const opens = (blocker: SetupStepId | null) => blocker ? <TV k="su.waiting" en="Opens when {step} is done." v={{ step: STEP_TITLE_TEXT[blocker] }} /> : null;

  // ---- step 1: the country (the same data the country screen loads) ----
  const infos = await Promise.all(allCountries(state).map(async (c) => ({ c, info: await indexOfCountry(deps, state, c.id) })));
  const euStaged = (() => { try { return deps.staged("kb/stage/eu").map((f) => ({ id: f.id, title: f.title, words: f.text.split(/\s+/).filter(Boolean).length })); } catch { return []; } })();
  const active = allCountries(state).find((c) => c.id === state.active.country) ?? country;

  // ---- step 4: the use case whose targets are open (from the notification link, or the first one that needs a person) ----
  const pick = cases.find((c) => c.ext_id === q.uc || c.id === q.uc)
    ?? cases.find((c) => targetStates.get(c.id)?.pending) ?? cases.find((c) => !targetStates.get(c.id)?.approved) ?? cases[0];
  let log: TargetEntry[] = [];
  let storeError: string | null = null;
  if (pick) { try { log = await loadTargetLog(orgId, pick.id); } catch (e) { storeError = e instanceof Error ? e.message : "The target log could not be read"; } }
  const pickGoals = pick ? await loadGoalsResolved(orgId, pick.entity) : null;
  const pickApprovers = pick ? withGovernance(await approversForUseCase(orgId, pick.id)).map((a) => ({ title: a.title, source: a.source })) : [];
  const perms = await permissionsFor(profile, user.id);
  const open = (id: SetupStepId) => q.step === id;

  const linkEntity = (name: string) => countryHref("/admin/federal/setup", country.id, name);
  const word = (n: number) => (n === 1 ? "use case" : "use cases");

  return (
    <ToolWorkspace country={country} orgName={org?.name} viewer={profile.role === "viewer"}
      title={<T k="su.title" en="Setup" />}
      description={<T k="su.lede" en="Everything a person supplies, in order, on one page. Each step opens when the one before it is done. After the use cases are in, the targets agent drafts their process targets and a person edits and approves them from a notification." />}>
      <SetupBar progress={progress} counts={{ cases: cases.length ? String(cases.length) : undefined, targets: count("targets"), sop: count("sop") }} />

      {entities.length > 1 && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium"><T k="setup.entity" en="Journey entity" /></span>
          {entities.map((e) => <Link key={e.name} href={linkEntity(e.name)} aria-current={e.name === entity?.name ? "true" : undefined} className={`rounded-full border px-3 py-1 ${e.name === entity?.name ? "border-lit bg-lit-soft/50 font-medium" : "border-line hover:border-ink-soft"}`}>{e.name}</Link>)}
        </p>
      )}

      <div className="flex flex-col gap-4">
        <SetupSection id="country" n={1} state={stateOf("country").state} waitingFor={null}
          summary={!registrationReady ? <T k="setup.country_needed" en="Set up the rules and policy knowledge base." />
            : !governanceAppointed ? <T k="setup.gov_needed" en="Appoint a governance admin: targets and test sets cannot be approved without one." />
              : !policyReady ? <T k="su.policy.needed" en="Set the country's policy target: the share of use cases to deploy, and by when." />
                : <T k="su.country.ready" en="Rules and policy sources are ready, the policy target is set, and a governance admin is appointed." />}
          openWhenDone={open("country")}>
          <div className="space-y-4">
            <CountryPanel key={country.id} canEdit={canEdit} active={active.id} selected={country.id}
              countries={infos.map(({ c, info }) => ({ id: c.id, name: c.name, ruleset: c.ruleset, currency: c.currency, ready: !!info, onDemand: c.built === "on_demand", custom: !!c.custom, hidden: !!c.hidden }))}
              rulesets={RULESETS.map((r) => ({ id: r.id, name: r.name }))} staged={euStaged} euBuilt={!!state.policies.EU} />
            {countryPolicy && <CountryPolicy key={country.id} policy={countryPolicy} noTarget={country.id !== "UAE" && !countryTarget} countryId={country.id} />}
            <GovernanceAdmin country={country.id} countryName={country.name} canEdit={canEdit} appointed={governanceAppointed}
              people={people.map((p) => ({ id: p.id, label: [p.full_name ?? p.email ?? p.id, p.job_title].filter(Boolean).join(" · ") }))} />
            <p className="text-sm text-ink-soft"><Link className="underline" href={countryHref("/admin/federal/country", country.id)}><T k="su.country.more" en="Run results, comparison and the country log" /></Link></p>
          </div>
        </SetupSection>

        <SetupSection id="goals" n={2} state={stateOf("goals").state} waitingFor={opens(progress.next)}
          summary={entity && hasMeasuredGoals(entity.goals) ? <TV k="su.goals.done" en="{n} goals, each with a measure and a target value." v={{ n: entity.goals.length }} /> : <T k="setup.goals_needed" en="Record a measurement and target for each goal." />}
          openWhenDone={open("goals")}>
          <div className="space-y-3">
            {entity ? (
              <>
                <p className="text-sm"><span className="font-medium">{entity.name}</span> <span className="text-xs text-ink-soft">· {entity.goals.length} <T k="gl.goals" en="goals" /></span></p>
                {entity.goals.length > 0 && <ul className="space-y-1 text-sm">{entity.goals.map((g) => <li key={g.id}><bdi dir="ltr" className="font-mono text-xs">{g.id}</bdi> · {g.text}{g.measurement && <span className="text-xs text-ink-soft"> · {g.measurement.comparison === "at_least" ? "≥" : "≤"} {g.measurement.value} {g.measurement.unit}</span>}</li>)}</ul>}
                <p className="text-sm"><T k="gl.country" en="Country" />: <EntityCountry entity={entity.name} country={entityCountryOf(state, entity.name)} countries={countryList} canEdit={canEdit} /></p>
                {canEdit && <EntityTools key={entity.name} name={entity.name} goals={entity.goals} hidden={false} requireMeasurement initialOpen={!hasMeasuredGoals(entity.goals)} />}
              </>
            ) : <p className="text-sm text-ink-soft"><T k="setup.entity_needed" en="Register an entity with measured service goals." /></p>}
            {canEdit && <AddEntity country={country.id} ready={registrationReady} initialOpen={!entity} onSetupPage />}
            {canEdit && linkable.length > 0 && <LinkEntity country={country.id} entities={linkable} />}
            {hiddenHere.length > 0 && (
              <div className="border-t border-line pt-3">
                <h3 className="text-base font-medium"><T k="en.hidden.h" en="Hidden entities" /></h3>
                <p className="mt-1 max-w-[68ch] text-sm text-ink-soft"><T k="en.hidden.lede" en="Hidden entities and their use cases are left out of the dashboard and the lists. Nothing is deleted." /></p>
                <ul className="mt-2 divide-y divide-line">{hiddenHere.map((e) => <li key={e.name} className="py-2"><span className="font-medium">{e.name}</span><EntityTools name={e.name} goals={e.goals} hidden /></li>)}</ul>
              </div>
            )}
          </div>
        </SetupSection>

        <SetupSection id="cases" n={3} state={stateOf("cases").state} waitingFor={opens(progress.next)}
          summary={cases.length ? <TV k="setup.case_count" en="{n} registered" v={{ n: cases.length }} /> : <T k="setup.cases_needed" en="Add the entity’s use cases from a CSV." />}
          openWhenDone={open("cases")}>
          {canEdit && entity ? <ImportCsv key={entity.name} existingIds={cases.map((c) => c.ext_id)} scope={{ country: country.id, entity: entity.name }} />
            : <p className="text-sm text-ink-soft"><T k="su.readonly" en="Read only: setting this up needs an administrator." /></p>}
        </SetupSection>

        <SetupSection id="targets" n={4} state={stateOf("targets").state} waitingFor={opens(progress.next)}
          summary={<TV k="su.targets.sum" en="The targets agent drafts each use case's process targets from the entity goals. You read the draft, change anything that is wrong, and approve. {a} of {n} {w} approved." v={{ a: stateOf("targets").count?.done ?? 0, n: cases.length, w: word(cases.length) }} />}
          openWhenDone={open("targets")}>
          <div className="space-y-4">
            <ul className="divide-y divide-line rounded-lg border border-line text-sm">
              {cases.map((c) => {
                const st = targetStates.get(c.id);
                const status = st?.pending ? (st.pending.by.startsWith("agent:") ? <T k="su.t.draft" en="Draft waiting for approval" /> : <T k="su.t.proposed" en="Proposed, waiting for approval" />) : st?.approved ? <><T k="pm.approved" en="Approved" /> v{st.approved.version}</> : <T k="su.t.none" en="Not drafted yet" />;
                return (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <Link className={`underline ${c.id === pick?.id ? "font-medium" : ""}`} href={`${countryHref("/admin/federal/setup", country.id, entity?.name)}&uc=${encodeURIComponent(c.ext_id)}&step=targets#step-targets`}><bdi dir="ltr" className="font-mono text-xs">{c.ext_id}</bdi> · {c.title}</Link>
                    <span className="text-xs text-ink-soft">{status}</span>
                  </li>
                );
              })}
            </ul>
            {pick && pickGoals && (
              <TargetsEditor key={pick.id} useCaseId={pick.id} entity={pick.entity} goals={pickGoals.goals} goalsSource={pickGoals.source}
                state={storeError ? EMPTY_TARGETS : replayTargets(log)} chain={verifyTargets(log)} approvers={pickApprovers}
                mayEdit={perms.can("scenario.edit", pick.id)} mayApprove={perms.can("scenario.approve", pick.id)} userId={user.id} storeError={storeError} />
            )}
          </div>
        </SetupSection>

        <SetupSection id="sop" n={5} state={stateOf("sop").state} waitingFor={opens(progress.next)}
          summary={<TV k="su.sop.sum" en="{r} of {n} use cases ready: SOP attached, knowledge base built, job profiles chosen. {a} SOPs attached." v={{ r: stateOf("sop").count?.done ?? 0, n: cases.length, a: cases.filter((c) => intake[c.id]).length }} />}
          openWhenDone={open("sop")}>
          <div className="flex flex-wrap items-center gap-3">
            <SopIntake key={entity?.name} country={country.id} entity={entity?.name} canEdit={canEdit}
              rows={cases.map((uc) => ({ id: uc.id, code: uc.ext_id, title: uc.title, frozen: uc.stage === "deployed", sop: intake[uc.id] }))} />
            <Link className="text-sm underline" href={countryHref("/admin/federal", country.id, entity?.name)}><T k="su.done.go" en="Go to the dashboard" /></Link>
          </div>
          <AutomationConfirm rows={automation} canEdit={canEdit} />
        </SetupSection>
        {entity && (
          <section aria-labelledby="coverage-h" className="rounded-xl border border-line bg-card p-4">
            <h2 id="coverage-h" className="font-display text-2xl font-medium"><T k="workspace.goals.matrix" en="Goals and use-case targets" /></h2>
            <p className="mt-1 text-sm"><span className="font-medium">{entity.name}</span> <span className="text-xs text-ink-soft">· {entity.goals.length} <T k="gl.goals" en="goals" /> · {coverageCases.length} <T k="gl.ucs" en="use cases" /></span></p>
            {canEdit && <EntityTools key={entity.name} idSuffix="-matrix" name={entity.name} goals={entity.goals} hidden={false} requireMeasurement initialOpen={!hasMeasuredGoals(entity.goals)} />}
            <div className="mt-3 overflow-x-auto rounded-lg border border-line" {...scrollRegion("coverage-h")}>
              <table className="w-full min-w-[44rem] text-start text-sm">
                <caption className="sr-only"><T k="workspace.goals.matrix" en="Goals and use-case targets" /></caption>
                <thead className="bg-paper-deep">
                  <tr className="text-xs text-ink-soft">
                    <th scope="col" className="px-3 py-1 text-start font-medium"><T k="gl.col.goal" en="Goal" /></th>
                    <th scope="col" className="py-1 pe-3 text-start font-medium whitespace-nowrap"><T k="gl.col.tag" en="Scoring tag" /></th>
                    <th scope="col" className="min-w-56 py-1 pe-3 text-start font-medium"><T k="gl.col.measure" en="Measurable criterion" /></th>
                    <th scope="col" className="py-1 pe-3 text-start font-medium whitespace-nowrap"><T k="en.measure.value" en="Target value" /></th>
                    {coverageCases.map((u) => (
                      <th scope="col" key={u.id} className="py-1 pe-3 text-start font-medium">
                        <Link className="underline" href={`${countryHref("/admin/federal/setup", country.id, entity.name)}&uc=${encodeURIComponent(u.ext_id)}&step=targets#step-targets`}>{u.ext_id}</Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entity.goals.map((g) => (
                    <tr key={g.id} className="border-t border-line align-top">
                      <th scope="row" className="px-3 py-2 text-start font-normal"><span className="font-mono text-xs">{g.id}</span> · {g.text}</th>
                      <td className="py-2 pe-3 text-xs text-ink-soft">{g.criterion ?? "—"}</td>
                      <td className="py-2 pe-3 text-xs">{g.measurement?.criterion ?? "—"}</td>
                      <td className="py-2 pe-3 text-xs text-ink-soft">{g.measurement ? <><span aria-hidden="true">{g.measurement.comparison === "at_least" ? "≥" : "≤"}</span><span className="sr-only">{g.measurement.comparison === "at_least" ? <T k="en.measure.min" en="At least" /> : <T k="en.measure.max" en="At most" />}</span> {g.measurement.value} {g.measurement.unit}</> : "—"}</td>
                      {coverageCases.map((u) => {
                        const approved = u.state?.approved ? coverage([g], u.state.approved.targets)[0].targets : [];
                        const proposed = u.state?.pending ? coverage([g], u.state.pending.targets)[0].targets : [];
                        return (
                          <td key={u.id} className="py-2 pe-3 text-xs">
                            {u.error ? <span className="text-ink-soft">—</span> : approved.length ? approved.map((t) => <span key={t.id} className="block">{t.id}: {describeTarget(t)}</span>) : proposed.length ? <span className="text-ink-soft"><T k="gl.proposed" en="proposed, not approved" /></span> : <span className="font-medium"><T k="gl.gap" en="no target" /></span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {entity.goals.length === 0 && <tr><td className="px-3 py-2 text-sm font-medium" colSpan={4 + coverageCases.length}><T k="gl.nogoals" en="This entity has no goals on record." /></td></tr>}
                </tbody>
              </table>
            </div>
            {coverageCases.some((u) => (u.state?.approved?.targets ?? []).some((t) => t.kind === "control")) && (
              <div className="mt-3">
                <p className="text-xs font-medium"><T k="gl.controls" en="Control targets (compliance rules, no goal link)" /></p>
                <ul className="mt-1 space-y-1 text-xs">
                  {coverageCases.flatMap((u) => controlsOf(u.state?.approved?.targets ?? []).map((t) => <li key={`${u.id}-${t.id}`}><span className="font-mono">{u.ext_id} {t.id}</span> · {t.statement}: {describeTarget(t)}</li>))}
                </ul>
              </div>
            )}
            {coverageCases.length === 0 && <p className="mt-2 text-sm text-ink-soft"><T k="gl.nouc" en="No use cases for this entity yet." /></p>}
          </section>
        )}
      </div>
    </ToolWorkspace>
  );
}
