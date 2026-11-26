import type { Metadata } from "next";
import type { CountryQuery } from "@/lib/un/country-context";
import { loadFederalCountry } from "@/lib/un/federal-country";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { requireFederalToolAccess } from "@/lib/un/federal-read-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadChunks } from "@/lib/un/kb";
import { DERIVED_GAPS } from "@/lib/un/rulesets";
import { GAP_CATEGORIES, loadGaps } from "@/lib/un/gaps";
import ToolWorkspace, { WorkspacePane } from "../_components/ToolWorkspace";
import WorkspaceSections from "../_components/WorkspaceSections";
import { T } from "../_components/Lang";
import { ArOnly, Rs } from "../_components/b-bits";

export const metadata: Metadata = { title: "Policy and standards gaps", robots: { index: false, follow: false } };

export default async function GapsPage({ searchParams }: { searchParams: Promise<CountryQuery> }) {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal/gaps");
  if (!profile?.org_id) redirect("/login");
  const { browseCountries } = await requireFederalToolAccess(profile.org_id, user.id, profile.role);
  const { country } = await loadFederalCountry(profile.org_id, (await searchParams).country, browseCountries);
  const { data: org } = await createAdminClient().from("organizations").select("name").eq("id", profile.org_id).maybeSingle();
  const f = loadGaps();
  const derived = DERIVED_GAPS.filter((g) => g.ruleset === country.ruleset);
  const chunk = new Map(loadChunks().map((c) => [c.chunk_id, c]));
  const quote = (id: string) => {
    const c = chunk.get(id);
    return c ? (
      <blockquote dir="ltr" lang="en" className="mt-1 border-s-2 border-line ps-3 text-xs text-ink-soft">
        {c.text.length > 320 ? `${c.text.slice(0, 320)}…` : c.text}
        <span className="mt-1 block font-mono">{id} · <a href={c.url} className="underline">{c.title}</a></span>
      </blockquote>
    ) : null;
  };
  return (
    <ToolWorkspace country={country} orgName={org?.name} viewer={profile.role === "viewer"}
      title={<T k="workspace.gaps" en="Policy and standards gaps" />}
      description={<><Rs id={country.ruleset} /> <ArOnly><T k="ub.en.note" en="" /></ArOnly></>}>
      {country.id === "UAE" ? <WorkspaceSections key={country.id} sections={GAP_CATEGORIES.map((cat) => ({
        id: cat,
        label: <T k={`ub.gap.cat.${cat}`} en={f.categories[cat]} />,
        anchors: f.gaps.filter((g) => g.category === cat).map((g) => g.id),
        content: (
          <section key={cat} id={cat} aria-labelledby={`h-${cat}`}>
            <h2 id={`h-${cat}`} className="font-display text-2xl font-medium tracking-tight"><T k={`ub.gap.cat.${cat}`} en={f.categories[cat]} /></h2>
            <p dir="ltr" lang="en" className="mt-2 max-w-[82ch] text-start text-sm text-ink-soft">{f.scope}</p>
            <ul className="mt-4 divide-y divide-line border-t border-line">
              {f.gaps.filter((g) => g.category === cat).map((g) => (
                <li key={g.id} id={g.id} className="min-w-0 py-4">
                  <p className="font-mono text-xs"><span dir="ltr" className="rounded-md bg-paper-deep px-2 py-0.5 font-medium text-ink">{g.id}</span></p>
                  <p dir="ltr" lang="en" className="font-display mt-2 text-start text-xl">{g.statement}</p>
                  <div className="mt-4 grid gap-5 desk:grid-cols-2">
                  <div className="min-w-0">
                  <h3 className="font-medium"><T k="ub.gap.nat" en="What the national sources say" /></h3>
                  <ul className="mt-2 space-y-3 text-sm">
                    {g.national.map((n) => <li key={n.chunk_id}><span dir="ltr" lang="en" className="block text-start">{n.note}</span>{quote(n.chunk_id)}</li>)}
                  </ul>
                  </div>
                  <div className="min-w-0">
                  <h3 className="font-medium"><T k="ub.gap.glob" en="Global examples (in the knowledge base)" /></h3>
                  <ul className="mt-2 space-y-3 text-sm">
                    {g.global.map((x) => (
                      <li key={x.source_id + x.chunk_ids.join()}>
                        <span className={`me-2 rounded-md px-2 py-0.5 font-mono text-xs ${x.support === "primary" ? "bg-paper-deep" : "border border-line"}`}>
                          {x.support === "primary" ? <T k="ub.gap.primary" en="primary text" /> : <T k="ub.gap.secondary" en="secondary summary" />}
                        </span>
                        <bdi dir="ltr" lang="en">{x.note}</bdi>
                        {x.chunk_ids.map((c) => <div key={c}>{quote(c)}</div>)}
                      </li>
                    ))}
                  </ul>
                  </div>
                  </div>
                  {g.not_ingested.length > 0 && (
                    <div className="mt-4 rounded-xl border border-dashed border-line p-3 text-sm">
                      <p className="font-mono text-xs tracking-[0.15em] text-ink-soft uppercase"><T k="ub.gap.noting" en="Not ingested, cited by name only" /></p>
                      <ul className="mt-1">{g.not_ingested.map((n) => <li key={n.name} dir="ltr" lang="en" className="text-start"><strong>{n.name}</strong>: {n.note}</li>)}</ul>
                    </div>
                  )}
                  <h3 className="mt-4 font-mono text-xs tracking-[0.15em] text-ink-soft uppercase"><T k="ub.gap.resp" en="How Prism responds" /></h3>
                  <p dir="ltr" lang="en" className="mt-2 text-start text-sm">{g.prism.response}</p>
                  <ul dir="ltr" className="mt-2 flex flex-wrap gap-2 font-mono text-xs text-ink-soft">
                    {g.prism.refs.map((r) => <li key={r.path + r.label} className="rounded-md bg-paper-deep px-2 py-0.5"><T k={`ub.gap.kind.${r.kind}`} en={r.kind} />: {r.label} ({r.path})</li>)}
                  </ul>
                  <p className="mt-4 text-xs text-ink-soft"><strong><T k="ub.gap.cav" en="Confidence and caveat." /></strong> <span dir="ltr" lang="en">{g.caveat}</span></p>
                </li>
              ))}
            </ul>
          </section>
        ),
      }))} /> : (
        <WorkspacePane id="ruleset-gaps" title={<T k="workspace.gaps.ruleset" en="Findings for this rule set" />}>
          {derived.length ? <ul className="divide-y divide-line">
            {derived.map((gap) => <li id={gap.id} key={gap.id} className="space-y-2 py-4 first:pt-0">
              <h3 className="text-lg font-medium">{gap.id}</h3>
              <p>{gap.statement}</p>
              {gap.chunk_ids.map((id) => <div key={id}>{quote(id)}</div>)}
            </li>)}
          </ul> : <p className="text-sm text-ink-soft"><T k="gap.country.empty" en="There are no documented policy gaps for the selected rule set." /></p>}
        </WorkspacePane>
      )}
    </ToolWorkspace>
  );
}
