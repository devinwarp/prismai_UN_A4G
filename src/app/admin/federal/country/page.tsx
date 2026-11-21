import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { baselineRun, companyView, indexOfCountry, loadState, scopeOf } from "@/lib/un/country-actions";
import { appCountryDeps } from "@/lib/un/country-app";
import { COUNTRIES, countryOf, diffProfiles, diffRuns, diffSops, rulesetOf, sourceCounts, type RunResult } from "@/lib/un/country";
import AdminHeader from "../../AdminHeader";
import LangShell, { T, TV } from "../_components/Lang";
import { card, scrollRegion, Section } from "../_components/ui";
import { CountryPanel } from "./CountryPanel";

export const metadata: Metadata = { title: "Country and knowledge base", robots: { index: false, follow: false } };
const chip = "inline-flex items-center rounded-md bg-paper-deep px-1.5 py-0.5 font-mono text-[11px]";
const short = (h: string) => h.slice(0, 10);

export default async function CountryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal/country");
  if (!profile?.org_id) redirect("/login");
  const sp = await searchParams;
  const orgId = profile.org_id;
  const { data: org } = await createAdminClient().from("organizations").select("name").eq("id", orgId).maybeSingle();
  const d = appCountryDeps(orgId);
  const { entries, state, verified } = await loadState(d);
  const canEdit = profile.role === "admin";
  const active = countryOf(state.active.country)!;

  const infos = await Promise.all(COUNTRIES.map(async (c) => ({ c, info: await indexOfCountry(d, state, c.id) })));
  const scope = (await scopeOf(d, state, active.id)) ?? [];

  // every run: the logged ones, plus the two precomputed baselines of the built-in company when they are not logged yet
  const runs: { run: RunResult; logged: boolean; at?: string }[] = Object.values(state.runs).map((r) => ({ run: r, logged: true, at: r.at }));
  for (const id of ["UAE", "SG"]) if (!state.runs[`marsa:${id}`]) { const b = await baselineRun(d, state, id); if (b) runs.push({ run: b.run, logged: false }); }
  runs.sort((x, y) => x.run.key.localeCompare(y.run.key));
  const byKey = new Map(runs.map((r) => [r.run.key, r.run]));
  const lastCompany = Object.values(state.companies).at(-1);
  const defA = "marsa:UAE";
  const defB = lastCompany ? `${lastCompany.id}:${lastCompany.country}` : "marsa:SG";
  const A = byKey.get(sp.a ?? defA), B = byKey.get(sp.b ?? defB);
  const diff = A && B ? diffRuns(A, B) : null;
  const cA = A ? await companyView(d, state, A.company) : null, cB = B ? await companyView(d, state, B.company) : null;
  const sopDiff = cA && cB && A!.company !== B!.company ? diffSops(cA.lines, cB.lines) : null;
  const profDiff = cA && cB && A!.company !== B!.company ? diffProfiles(cA.profiles, cB.profiles) : null;

  const euStaged = (() => { try { return d.staged("kb/stage/eu").map((f) => ({ id: f.id, title: f.title, words: f.text.split(/\s+/).filter(Boolean).length })); } catch { return []; } })();
  const sources = sourceCounts(scope);

  return (
    <div className="conduit-bg min-h-dvh">
      <AdminHeader active="federal" orgName={org?.name} viewer={profile.role === "viewer"} />
      <LangShell>
        <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <p className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase">{canEdit ? <T k="gt.eyebrow" en="Governance" /> : <T k="gt.readonly" en="Read-only" />}</p>
          <h1 className="font-display mt-2 text-3xl font-medium tracking-tight sm:text-4xl"><T k="cn.title" en="Country and knowledge base" /></h1>
          <p className="mt-3 max-w-[68ch] text-base text-ink-soft">
            <T k="cn.lede" en="A country is data: the scope of its sources (its own plus international standards) and the rule set that judges its verdicts. Switching the country re-runs the whole process for the licence-renewal use case under that country's rule set and sources." />{" "}
            <Link href="/admin/federal" className="underline"><T k="sop.back" en="Back to the dashboard" /></Link>
          </p>
          <p role="note" className="mt-3 max-w-[68ch] rounded-lg border border-line bg-paper-deep p-3 text-sm">
            <T k="cn.limits" en="Honest limits: the rule sets are simplified demo encodings, not legal advice. Retrieval is lexical (BM25) plus vectors where they were built. The sample SOPs are synthetic and differ in a few details. All data is synthetic." />
          </p>

          <div className="mt-10 space-y-12">
            <Section id="now" eyebrow={<T k="cn.now" en="Now" />} title={<T k="cn.now" en="Where this organisation is" />}>
              <div className={card}>
                <dl className="grid gap-3 text-sm sm:grid-cols-4">
                  <div><dt className="text-ink-soft"><T k="cn.company" en="Company" /></dt><dd className="font-medium">{(state.companies[state.active.company]?.name) ?? "Marsa Public Services Authority (fictitious)"}</dd></div>
                  <div><dt className="text-ink-soft"><T k="cn.country" en="Country" /></dt><dd className="font-medium">{active.name}</dd></div>
                  <div><dt className="text-ink-soft"><T k="cn.ruleset" en="Rule set" /></dt><dd className="font-mono">{rulesetOf(active).id}</dd></div>
                  <div><dt className="text-ink-soft">Log</dt><dd>{entries.length} · {verified.ok ? "chain verified" : `BROKEN at ${verified.broken_seq}`}</dd></div>
                </dl>
                <div className="mt-6">
                  <CountryPanel canEdit={canEdit} active={active.id} countries={infos.map(({ c, info }) => ({ id: c.id, name: c.name, ready: !!info, onDemand: c.built === "on_demand" }))} staged={euStaged} euBuilt={!!state.policies.EU} companyCount={Object.keys(state.companies).length} />
                </div>
              </div>
            </Section>

            <Section id="indexes" eyebrow={<T k="cn.scope" en="Knowledge base" />} title={<T k="cn.scope" en="Index per country" />}>
              <div className="grid gap-4 sm:grid-cols-3">
                {infos.map(({ c, info }) => (
                  <div key={c.id} className={card}>
                    <h3 className="font-medium">{c.name} <span className={chip}>{rulesetOf(c).id}</span></h3>
                    {info ? (
                      <>
                        <p className="mt-2 text-sm"><TV k="cn.ready" en="Index ready: {n} chunks from {s} sources, vectors {v}" v={{ n: info.chunks, s: info.sources, v: info.vectors ? `${info.vectors.have}/${info.vectors.of}${info.vectors.built ? `, built ${info.vectors.built}` : ""}` : "none" }} /></p>
                        <p className="mt-1 text-xs text-ink-soft">BM25: {info.bm25.docs} docs, {info.bm25.terms} terms (in memory, {info.bm25.ms} ms to build here){state.policies[c.id] ? ` · built live in ${state.policies[c.id].total_ms} ms` : c.built === "precomputed" ? " · precomputed" : ""}</p>
                        <p className="mt-1 text-xs text-ink-soft">{Object.entries(info.byJurisdiction).map(([j, n]) => `${j} ${n}`).join(" · ")}</p>
                        <p className="mt-2 text-xs text-ink-soft">Gates: {rulesetOf(c).gates.join(", ")}</p>
                      </>
                    ) : <p className="mt-2 text-sm text-ink-soft"><T k="cn.noindex" en="No index yet: add this country's policy first." /></p>}
                  </div>
                ))}
              </div>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm underline">{active.name}: {sources.length} sources, {scope.length} chunks</summary>
                <div {...scrollRegion("cn-src")} className="mt-2 max-h-96 overflow-auto rounded-2xl border border-line bg-card">
                  <table className="w-full text-sm">
                    <caption id="cn-src" className="sr-only">Sources in the active scope with chunk counts</caption>
                    <thead className="text-start font-mono text-[11px] uppercase"><tr><th scope="col" className="px-3 py-2 text-start font-normal">Source</th><th scope="col" className="text-start font-normal">Jurisdiction</th><th scope="col" className="pe-3 text-end font-normal">Chunks</th></tr></thead>
                    <tbody>{sources.map((s) => <tr key={s.source_id} className="border-t border-line"><th scope="row" className="px-3 py-1.5 text-start font-normal"><a href={s.url} className="underline">{s.title.slice(0, 90)}</a> <span className="font-mono text-[11px] text-ink-soft">{s.source_id}</span></th><td>{s.jurisdiction}</td><td className="pe-3 text-end">{s.chunks}</td></tr>)}</tbody>
                  </table>
                </div>
              </details>
            </Section>

            <Section id="results" eyebrow={<T k="cn.results" en="Results" />} title={<T k="cn.results" en="Results of the staged process (UC02)" />}>
              <div {...scrollRegion("cn-res")} className="overflow-x-auto rounded-2xl border border-line bg-card">
                <table className="w-full min-w-[56rem] text-sm">
                  <caption id="cn-res" className="sr-only">Verdict per step for each company and country</caption>
                  <thead className="font-mono text-[11px] uppercase"><tr><th scope="col" className="px-3 py-2 text-start font-normal">Company · country</th><th scope="col" className="text-start font-normal">Rule set</th><th scope="col" className="text-start font-normal">Steps T0 to T4</th><th scope="col" className="text-start font-normal">Final</th><th scope="col" className="text-start font-normal">Head hash</th><th scope="col" className="pe-3 text-start font-normal"></th></tr></thead>
                  <tbody>
                    {runs.map(({ run: r, logged }) => (
                      <tr key={r.key} className="border-t border-line align-top">
                        <th scope="row" className="px-3 py-2 text-start font-normal">{r.company_name}<span className="block text-xs text-ink-soft">{countryOf(r.country)?.name} · SOP {r.sop_id}</span></th>
                        <td className="font-mono text-xs">{r.ruleset}</td>
                        <td className="text-xs">{r.steps.map((s) => s.verdict.replace("_", " ")).join(" → ")}</td>
                        <td className="font-medium">{r.final.replace("_", " ")}</td>
                        <td className="font-mono text-xs">{short(r.head_hash)}</td>
                        <td className="pe-3 text-xs text-ink-soft">{logged ? <T k="cn.logged" en="logged" /> : <T k="cn.computed" en="computed now (not logged)" />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-ink-soft">A run is deterministic: same country, rule set, sources and SOP give the same head hash, so switching back reproduces the stored result exactly. No model is called. The evidence events are the same five staged steps for every company; verdicts differ because the rule set differs.</p>
              {A && (
                <details className="mt-4" open>
                  <summary className="cursor-pointer text-sm font-medium">Cited sources, per run</summary>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {[A, B].filter(Boolean).map((r) => (
                      <div key={r!.key} className={card}>
                        <h4 className="font-medium">{r!.company_name} · {countryOf(r!.country)?.id}</h4>
                        <ul className="mt-2 space-y-2 text-xs">{r!.cited.map((c) => <li key={c.chunk_id}><span className="font-mono">{c.chunk_id}</span> <span className={chip}>{c.from === "company_sop" ? "company SOP" : c.jurisdiction}</span><span className="block text-ink-soft">“{c.quote.slice(0, 200)}”</span></li>)}</ul>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </Section>

            <Section id="compare" eyebrow={<T k="cn.compare" en="Compare" />} title={<T k="cn.compare" en="What changed between two runs" />}>
              <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
                {(["a", "b"] as const).map((k) => (
                  <label key={k}>{k.toUpperCase()}
                    <select name={k} defaultValue={k === "a" ? A?.key : B?.key} className="ms-2 rounded-lg border border-line bg-paper px-2 py-1">
                      {runs.map(({ run: r }) => <option key={r.key} value={r.key}>{r.company_name.replace(/ \((fictitious|synthetic)\)/, "")} · {r.country}</option>)}
                    </select>
                  </label>
                ))}
                <button className="rounded-xl border border-line px-3 py-1.5" type="submit"><T k="cn.compare.go" en="Compare" /></button>
              </form>
              {diff && A && B && (
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className={card}>
                    <h3 className="font-medium"><T k="cn.diff.steps" en="Verdict per step" /></h3>
                    <table className="mt-2 w-full text-sm"><caption className="sr-only">Verdict per step in the two runs</caption><thead className="font-mono text-[11px] uppercase"><tr><th scope="col" className="text-start font-normal">Step</th><th scope="col" className="text-start font-normal">A</th><th scope="col" className="text-start font-normal">B</th></tr></thead>
                      <tbody>{diff.steps.map((s) => <tr key={s.step} className="border-t border-line"><th scope="row" className="py-1 text-start font-normal">{s.step}</th><td>{s.a.replace("_", " ")}</td><td className={s.differs ? "font-medium" : ""}>{s.b.replace("_", " ")}{s.differs ? " ◄ differs" : ""}</td></tr>)}</tbody></table>
                    <p className="mt-2 text-sm">Final: <b>{diff.verdict.a.replace("_", " ")}</b> vs <b>{diff.verdict.b.replace("_", " ")}</b>{diff.verdict.differs ? " (differs)" : " (same)"}</p>
                  </div>
                  <div className={card}>
                    <h3 className="font-medium"><T k="cn.diff.gates" en="Gates required" /></h3>
                    <p className="mt-2 text-sm">Only in A ({A.ruleset}): {diff.gates.onlyA.join(", ") || "none"}</p>
                    <p className="text-sm">Only in B ({B.ruleset}): {diff.gates.onlyB.join(", ") || "none"}</p>
                    <p className="text-sm text-ink-soft">In both: {diff.gates.both.join(", ") || "none"}</p>
                    <h3 className="mt-4 font-medium"><T k="cn.diff.sources" en="Cited sources" /></h3>
                    <p className="mt-2 text-xs">Only A: {diff.sources.onlyA.join(", ") || "none"}</p>
                    <p className="text-xs">Only B: {diff.sources.onlyB.join(", ") || "none"}</p>
                    <p className="text-xs text-ink-soft">Both: {diff.sources.both.join(", ") || "none"}</p>
                  </div>
                  {profDiff && (
                    <div className={card}>
                      <h3 className="font-medium"><T k="cn.diff.profiles" en="Job profiles" /></h3>
                      <p className="mt-2 text-sm">Only in A: {profDiff.onlyA.join(", ") || "none"}</p>
                      <p className="text-sm">Only in B: {profDiff.onlyB.join(", ") || "none"}</p>
                      <p className="text-sm text-ink-soft">Different task count: {profDiff.changed.map((c) => `${c.name} ${c.a} → ${c.b}`).join("; ") || "none"}</p>
                    </div>
                  )}
                  {sopDiff && (
                    <div className={`${card} lg:col-span-2`}>
                      <h3 className="font-medium"><T k="cn.diff.sop" en="What changed in the SOP (lines only in one of the two; names and ids neutralised)" /></h3>
                      <div className="mt-2 grid gap-3 text-xs sm:grid-cols-2">
                        <div><p className="font-medium">Only in A</p><ul className="mt-1 space-y-1">{sopDiff.removed.map((l, i) => <li key={i} className="rounded bg-paper-deep p-1.5">{l.slice(0, 220)}</li>)}</ul></div>
                        <div><p className="font-medium">Only in B</p><ul className="mt-1 space-y-1">{sopDiff.added.map((l, i) => <li key={i} className="rounded bg-paper-deep p-1.5">{l.slice(0, 220)}</li>)}</ul></div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Section>

            <Section id="log" eyebrow={<T k="cn.log" en="Log" />} title={<T k="cn.log" en="Hash-chained country log" />}>
              <div {...scrollRegion("cn-log")} className="max-h-80 overflow-auto rounded-2xl border border-line bg-card">
                <table className="w-full text-sm"><caption id="cn-log" className="sr-only">Country log entries</caption>
                  <thead className="font-mono text-[11px] uppercase"><tr><th scope="col" className="px-3 py-2 text-start font-normal">#</th><th scope="col" className="text-start font-normal">Kind</th><th scope="col" className="text-start font-normal">By</th><th scope="col" className="text-start font-normal">At (UTC)</th><th scope="col" className="pe-3 text-start font-normal">Hash</th></tr></thead>
                  <tbody>{[...entries].reverse().map((e) => <tr key={e.seq} className="border-t border-line"><td className="px-3 py-1.5">{e.seq}</td><td>{e.kind}{e.kind === "switch" ? `: ${String(e.payload.from)} → ${String(e.payload.to)}` : e.kind === "run" ? `: ${(e.payload.result as RunResult).key} ${(e.payload.result as RunResult).final}` : ""}</td><td>{e.actor}</td><td className="font-mono text-xs">{e.at.slice(0, 19)}</td><td className="pe-3 font-mono text-xs">{short(e.hash)}</td></tr>)}</tbody>
                </table>
              </div>
            </Section>
          </div>
        </main>
      </LangShell>
    </div>
  );
}
