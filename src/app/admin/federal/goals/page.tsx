import type { Metadata } from "next";
import Link from "next/link";
import type { CountryQuery } from "@/lib/un/country-context";
import { loadFederalCountry } from "@/lib/un/federal-country";
import { entityRegistrationReady } from "@/lib/un/country-actions";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { requireFederalToolAccess } from "@/lib/un/federal-read-access";
import { entityCountryOf, visibleCountries } from "@/lib/un/country";
import { loadEntityOverview } from "@/lib/un/target-store";
import { EntityCountry, LinkEntity } from "./EntityCountry";
import { AddEntity, EntityTools } from "./EntityAdmin";
import { loadEntityRows } from "@/lib/un/entity-store";
import { loadAssignmentRows, loadPeople } from "@/lib/un/roles-store";
import { peopleOfEntity } from "@/lib/un/entity-admin";
import { hasMeasuredGoals } from "@/lib/un/goals";
import { controlsOf, coverage, describeTarget } from "@/lib/un/targets";
import { createAdminClient } from "@/lib/supabase/admin";
import ToolWorkspace from "../_components/ToolWorkspace";
import WorkspaceSections from "../_components/WorkspaceSections";
import { T } from "../_components/Lang";
import { scrollRegion } from "../_components/ui";

export const metadata: Metadata = { title: "Entity goals and targets", robots: { index: false, follow: false } };

// goals and targets change at any time: never prerender it
export const dynamic = "force-dynamic";

const entitySectionId = (name: string) => `entity-${Buffer.from(name).toString("base64url")}`;

/** Every entity with its goals, and under each the use cases and the targets that contribute to those goals. Read-only:
 * a goal with no approved target is shown as a gap. */
export default async function GoalsPage({ searchParams }: { searchParams: Promise<CountryQuery & { add?: string }> }) {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal/goals");
  if (!profile?.org_id) redirect("/login");
  const { browseCountries } = await requireFederalToolAccess(profile.org_id, user.id, profile.role);
  const query = await searchParams;
  const { country, state: countryState, deps } = await loadFederalCountry(profile.org_id, query.country, browseCountries);
  const canEdit = profile.role === "admin";
  const [all, rows, assignments, people, { data: org }, registrationReady] = await Promise.all([
    loadEntityOverview(profile.org_id), loadEntityRows(profile.org_id).catch(() => []), loadAssignmentRows(profile.org_id).catch(() => []),
    loadPeople(profile.org_id).catch(() => []), createAdminClient().from("organizations").select("name").eq("id", profile.org_id).maybeSingle(),
    canEdit && entityRegistrationReady(deps, countryState, country).catch(() => false),
  ]);
  const hiddenNames = new Set(rows.filter((r) => r.hidden).map((r) => r.name));
  const registered = new Set(rows.filter((r) => r.country_id).map((r) => r.name));
  // a hidden entity is left out for everyone; an admin sees it listed at the foot, to unhide
  const scoped = all.filter((e) => entityCountryOf(countryState, e.name) === country.id);
  const entities = scoped.filter((e) => !hiddenNames.has(e.name));
  const hiddenEntities = canEdit ? scoped.filter((e) => hiddenNames.has(e.name)) : [];
  const linkable = all.filter((e) => !hiddenNames.has(e.name) && entityCountryOf(countryState, e.name) !== country.id).map((e) => e.name);
  // an entity's people are whoever holds a live role on one of its use cases
  const ucEntities = all.flatMap((e) => e.use_cases.map((u) => ({ id: u.id, entity: e.name })));
  const peopleOf = (entity: string) => peopleOfEntity(entity, assignments, ucEntities).map((id) => people.find((p) => p.id === id)?.email ?? id);
  const countries = visibleCountries(countryState).map((c) => ({ id: c.id, name: c.name }));

  const showManagement = canEdit;
  const selected = entities.find((entry) => entry.name === query.entity) ?? entities[0];
  const empty = <p className="text-sm text-ink-soft"><T k="goals.country.empty" en="No entities are linked to this country yet." /></p>;
  return (
    <ToolWorkspace country={country} backEntity={typeof query.entity === "string" && selected?.name === query.entity ? query.entity : undefined} orgName={org?.name} viewer={profile.role === "viewer"}
      title={<T k="workspace.goals" en="Entity goals and targets" />}
      description={<T k="workspace.goals.description" en="Select an entity to see its goals and the targets each use case has committed to." />}>
      <WorkspaceSections key={country.id} defaultSection={selected ? entitySectionId(selected.name) : undefined} sections={[
        ...(showManagement ? [{ id: "manage", label: <T k="workspace.goals.manage" en="Manage entities" />, content: (
          <section id="manage" aria-labelledby="goals-manage-heading">
            <h2 id="goals-manage-heading" className="mb-2 font-display text-2xl font-medium"><T k="workspace.goals.manage" en="Manage entities" /></h2>
            {!entities.length && empty}
            <AddEntity country={country.id} ready={registrationReady} initialOpen={query.add === "1"} />
            {linkable.length > 0 && <LinkEntity country={country.id} entities={linkable} />}
        {hiddenEntities.length > 0 && (
          <section className="mt-6 border-t border-line pt-4" aria-labelledby="gl-hidden">
            <h2 id="gl-hidden" className="font-display text-xl font-medium"><T k="en.hidden.h" en="Hidden entities" /></h2>
            <p className="mt-1 max-w-[68ch] text-sm text-ink-soft"><T k="en.hidden.lede" en="Hidden entities and their use cases are left out of the dashboard and the lists. Nothing is deleted." /></p>
            <ul className="mt-3 divide-y divide-line">
              {hiddenEntities.map((e) => <li key={e.name} className="py-3"><span className="font-medium">{e.name}</span> <span className="text-xs text-ink-soft">· {e.use_cases.length} <T k="gl.ucs" en="use cases" /></span><EntityTools name={e.name} goals={e.goals} hidden /></li>)}
            </ul>
          </section>
        )}
          </section>
        ) }] : []),
        ...entities.map((e) => {
          const id = entitySectionId(e.name);
          return {
            id,
            label: e.name,
            content: (
              <section id={id} aria-labelledby={`${id}-heading`}>
                <h2 id={`${id}-heading`} className="font-display text-2xl font-medium">{e.name}</h2>
                <p className="mt-2 text-sm"><T k="gl.country" en="Country" />: <EntityCountry entity={e.name} country={entityCountryOf(countryState, e.name)} countries={countries} canEdit={profile.role === "admin"} /></p>
                <p className="mt-1 text-xs text-ink-soft"><T k="gl.source" en="Goals read from" />: <span className="font-mono">{e.source}</span> · {e.goals.length} <T k="gl.goals" en="goals" /> · {e.use_cases.length} <T k="gl.ucs" en="use cases" /></p>
                <p className="mt-1 text-xs text-ink-soft"><T k="en.people" en="People" />: {peopleOf(e.name).length ? <bdi dir="ltr">{peopleOf(e.name).join(", ")}</bdi> : <T k="en.people.none" en="No one is linked to this entity yet." />} <Link className="underline" href="/admin/federal/people"><T k="en.people.manage" en="Manage on the People screen" /></Link></p>
                {canEdit && <EntityTools name={e.name} goals={e.goals} hidden={false} requireMeasurement={registered.has(e.name)} initialOpen={query.entity === e.name && !hasMeasuredGoals(e.goals)} />}
                <div className="mt-4 overflow-x-auto rounded-lg border border-line" {...scrollRegion(`${id}-heading`)}>
                  <table className="w-full min-w-[30rem] text-start text-sm [&_td:first-child]:ps-3 [&_th:first-child]:ps-3">
                    <caption className="sr-only"><T k="workspace.goals.matrix" en="Goals and use-case targets" /></caption>
                    <thead className="bg-paper-deep"><tr className="text-xs text-ink-soft"><th className="py-1 pe-3 text-start font-medium"><T k="gl.col.goal" en="Goal" /></th><th className="py-1 pe-3 text-start font-medium"><T k="gl.col.crit" en="Criterion" /></th><th className="py-1 pe-3 text-start font-medium"><T k="en.measure.value" en="Target value" /></th>{e.use_cases.map((u) => <th key={u.id} className="py-1 pe-3 text-start font-medium"><Link className="underline" href={`/admin/federal/use-cases/${u.id}/targets`}>{u.ext_id}</Link></th>)}</tr></thead>
                    <tbody>
                      {e.goals.map((g) => (
                        <tr key={g.id} className="border-t border-line align-top">
                          <td className="py-2 pe-3"><span className="font-mono text-xs">{g.id}</span> · {g.text}</td>
                          <td className="py-2 pe-3 text-xs text-ink-soft">{g.measurement?.criterion ?? g.criterion ?? "—"}</td>
                          <td className="py-2 pe-3 text-xs text-ink-soft">{g.measurement ? <><span aria-hidden="true">{g.measurement.comparison === "at_least" ? "≥" : "≤"}</span><span className="sr-only">{g.measurement.comparison === "at_least" ? <T k="en.measure.min" en="At least" /> : <T k="en.measure.max" en="At most" />}</span> {g.measurement.value} {g.measurement.unit}</> : "—"}</td>
                          {e.use_cases.map((u) => {
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
                      {e.goals.length === 0 && <tr><td className="py-2 text-sm font-medium" colSpan={3 + e.use_cases.length}><T k="gl.nogoals" en="This entity has no goals on record." /></td></tr>}
                    </tbody>
                  </table>
                </div>
                {e.use_cases.some((u) => (u.state?.approved?.targets ?? []).some((t) => t.kind === "control")) && (
                  <div className="mt-3">
                    <p className="text-xs font-medium"><T k="gl.controls" en="Control targets (compliance rules, no goal link)" /></p>
                    <ul className="mt-1 space-y-1 text-xs">
                      {e.use_cases.flatMap((u) => controlsOf(u.state?.approved?.targets ?? []).map((t) => <li key={`${u.id}-${t.id}`}><span className="font-mono">{u.ext_id} {t.id}</span> · {t.statement}: {describeTarget(t)}</li>))}
                    </ul>
                  </div>
                )}
                {e.use_cases.some((u) => u.error) && <p role="alert" className="mt-2 text-sm">{e.use_cases.find((u) => u.error)?.error}</p>}
                {e.use_cases.length === 0 && <p className="mt-2 text-sm text-ink-soft"><T k="gl.nouc" en="No use cases for this entity yet." /></p>}
              </section>
            ),
          };
        }),
        ...(!showManagement && !entities.length ? [{ id: "entities", label: <T k="workspace.goals" en="Entity goals and targets" />, content: empty }] : []),
      ]} />
    </ToolWorkspace>
  );
}
