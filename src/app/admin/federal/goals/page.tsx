import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { appCountryDeps } from "@/lib/un/country-app";
import { loadState } from "@/lib/un/country-actions";
import { allCountries, entityCountryOf } from "@/lib/un/country";
import { loadEntityOverview } from "@/lib/un/target-store";
import { EntityCountry } from "./EntityCountry";
import { controlsOf, coverage, describeTarget } from "@/lib/un/targets";
import LangShell, { T } from "../_components/Lang";
import { card } from "../_components/ui";

export const metadata: Metadata = { title: "Entity goals and targets", robots: { index: false, follow: false } };

// goals and targets change at any time: never prerender it
export const dynamic = "force-dynamic";

/** Every entity with its goals, and under each the use cases and the targets that contribute to those goals. Read-only:
 * a goal with no approved target is shown as a gap. */
export default async function GoalsPage() {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal/goals");
  if (!profile?.org_id) redirect("/login");
  const entities = await loadEntityOverview(profile.org_id);
  const cs = await loadState(appCountryDeps(profile.org_id)).then((r) => r.state).catch(() => null);
  const countries = allCountries(cs ?? { countries: {} }).map((c) => ({ id: c.id, name: c.name }));

  return (
    <LangShell>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase"><T k="gl.eyebrow" en="Entity goals" /></p>
        <h1 className="font-display mt-2 text-3xl font-medium tracking-tight sm:text-4xl"><T k="gl.h1" en="What each entity wants, and what each use case commits to" /></h1>
        <p className="mt-3 max-w-[68ch] text-base text-ink-soft"><T k="gl.lede" en="Goals belong to the entity. Each use case proposes targets that contribute to them, and a person approves those targets. A goal with no approved target has no measurable contribution yet." /></p>

        {entities.map((e) => (
          <section key={e.name} className={`${card} mt-6`} aria-labelledby={`gl-${e.name}`}>
            <h2 id={`gl-${e.name}`} className="font-display text-xl font-medium">{e.name}</h2>
            <p className="mt-2 text-sm"><T k="gl.country" en="Country" />: <EntityCountry entity={e.name} country={cs ? entityCountryOf(cs, e.name) : "UAE"} countries={countries} canEdit={profile.role === "admin"} /></p>
            <p className="mt-1 text-xs text-ink-soft"><T k="gl.source" en="Goals read from" />: <span className="font-mono">{e.source}</span> · {e.goals.length} <T k="gl.goals" en="goals" /> · {e.use_cases.length} <T k="gl.ucs" en="use cases" /></p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead><tr className="text-xs text-ink-soft"><th className="py-1 pe-3 text-start font-medium"><T k="gl.col.goal" en="Goal" /></th><th className="py-1 pe-3 text-start font-medium"><T k="gl.col.crit" en="Criterion" /></th>{e.use_cases.map((u) => <th key={u.id} className="py-1 pe-3 text-start font-medium"><Link className="underline" href={`/admin/federal/use-cases/${u.id}/targets`}>{u.ext_id}</Link></th>)}</tr></thead>
                <tbody>
                  {e.goals.map((g) => (
                    <tr key={g.id} className="border-t border-line align-top">
                      <td className="py-2 pe-3"><span className="font-mono text-xs">{g.id}</span> · {g.text}</td>
                      <td className="py-2 pe-3 text-xs text-ink-soft">{g.criterion}</td>
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
                  {e.goals.length === 0 && <tr><td className="py-2 text-sm font-medium" colSpan={2 + e.use_cases.length}><T k="gl.nogoals" en="This entity has no goals on record." /></td></tr>}
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
        ))}
      </main>
    </LangShell>
  );
}
