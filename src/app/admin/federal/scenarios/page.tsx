import { isOrgAdmin } from "@/lib/roles";
import type { Metadata } from "next";
import Link from "next/link";
import type { CountryQuery } from "@/lib/un/country-context";
import { loadCountryUseCases, loadFederalCountry } from "@/lib/un/federal-country";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { requireFederalToolAccess } from "@/lib/un/federal-read-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { listRuns } from "@/lib/un/runs";
import { SCENARIOS } from "@/lib/un/scenarios";
import ToolWorkspace, { WorkspacePane } from "../_components/ToolWorkspace";
import { T, TV } from "../_components/Lang";
import StartRun from "./StartRun";

const WHAT: Record<string, string> = {
  S1: "A trade-licence assistant is cleared step by step. Watch the decision go from blocked to cleared as evidence arrives. About 2 minutes.",
  S2: "A voice assistant on a live pilot starts making things up. See how a rising error rate changes the decision.",
  S3: "The federal view: 20 use cases in 5 entities, and how the 50% target moves at each step.",
  S4: "A citizen assistant starts promoting paid products, then leaks personal data. The decision escalates.",
};

export const metadata: Metadata = { title: "Scenarios", robots: { index: false, follow: false } };

export default async function ScenariosPage({ searchParams }: { searchParams: Promise<CountryQuery> }) {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal/scenarios");
  if (!profile?.org_id) redirect("/login");
  const { browseCountries } = await requireFederalToolAccess(profile.org_id, user.id, profile.role);
  const { country, state } = await loadFederalCountry(profile.org_id, (await searchParams).country, browseCountries);
  const [{ data: org }, runs, cases] = await Promise.all([
    createAdminClient().from("organizations").select("name").eq("id", profile.org_id).maybeSingle(),
    country.id === "UAE" ? listRuns(profile.org_id) : Promise.resolve([]),
    country.id === "UAE" ? loadCountryUseCases(profile.org_id, state, country.id) : Promise.resolve([]),
  ]);
  const ids = new Set(cases.map((useCase) => useCase.ext_id));
  const scenarios = Object.values(SCENARIOS).filter((s) => s.kind === "gate" ? ids.has(s.ext_id) : ids.size > 0);
  return (
    <ToolWorkspace country={country} orgName={org?.name} viewer={profile.role === "viewer"}
      title={<T k="sc.title" en="Run a scenario" />}
      description={<T k="sc.lede" en="You release evidence one step at a time, each step to only some of the agents. The policy engine decides, a person signs, and every step is written to a tamper-proof logbook." />}>
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] desk:min-h-0 desk:flex-1 short:gap-3">
        <WorkspacePane id="scenarios-choose" title={<T k="sc.choose" en="Choose a scenario" />}>
          {scenarios.length ? (
            <ul className="divide-y divide-line">
              {scenarios.map((s, index) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 py-4 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                      <bdi dir="ltr" className="rounded-md bg-paper-deep px-2 py-0.5 font-mono font-medium text-ink">{s.id}</bdi>
                      <span>{s.kind === "gate" ? <T k="sc.kind.gate" en="One use case: a decision at each step" /> : <T k="sc.kind.fed" en="Whole portfolio: a sandbox copy of the dashboard at each step (not the live register)" />}</span>
                    </p>
                    <h3 className="mt-1 font-display text-lg font-medium leading-snug"><T k={`ua.sc.${s.id}.title`} en={s.title} /></h3>
                    {WHAT[s.id] && <p className="mt-1 max-w-[72ch] text-sm text-ink-soft"><T k={`ua.sc.${s.id}.what`} en={WHAT[s.id]} /></p>}
                    <ol className="mt-2 flex flex-wrap gap-1.5" aria-label={`${s.steps.length} steps`} dir="ltr">
                      {s.steps.map((st) => (
                        <li key={st.step} className="flex h-6 min-w-8 items-center justify-center rounded-md border border-line font-mono text-[11px] text-ink-soft">{st.step}</li>
                      ))}
                    </ol>
                  </div>
                  {isOrgAdmin(profile.role) && <StartRun scenarioId={s.id} primary={index === 0} />}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-soft"><T k="sc.country.empty" en="No staged scenarios are available for this country." /></p>}
        </WorkspacePane>
        <WorkspacePane id="scenarios-history" title={<T k="sc.past" en="Past runs" />}>
          {runs.length ? (
            <ul className="divide-y divide-line">
              {runs.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/federal/runs/${r.id}`} className="block rounded-md px-2 py-3 text-sm hover:bg-paper-deep/60">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <bdi dir="ltr" className="rounded-md bg-paper-deep px-2 py-0.5 font-mono text-xs font-medium">{r.scenario_id}</bdi>
                      <span className="font-medium">{r.steps === 1 ? <T k="ua.sc.step1" en="1 step released" /> : <TV k="ua.sc.steps" en="{n} steps released" v={{ n: r.steps }} />}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${r.done ? "border-lit/50 text-lit-deep" : "border-line text-ink-soft"}`}>{r.done ? <T k="ua.sc.complete" en="complete" /> : <T k="ua.sc.progress" en="in progress" />}</span>
                    </span>
                    <time dateTime={r.created_at} dir="ltr" className="mt-1 block text-start text-xs tabular-nums text-ink-soft">{new Date(r.created_at).toLocaleString("en-GB", { timeZone: "Asia/Dubai" })}</time>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-soft"><T k="sc.past.empty" en="No runs recorded for this country yet." /></p>}
        </WorkspacePane>
      </div>
    </ToolWorkspace>
  );
}
