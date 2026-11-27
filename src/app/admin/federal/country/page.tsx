import { isOrgAdmin } from "@/lib/roles";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { requireFederalToolAccess } from "@/lib/un/federal-read-access";
import { canCompareCountries as mayCompareCountries } from "@/lib/un/people-directory";
import { createAdminClient } from "@/lib/supabase/admin";
import { baselineRun, companyView, indexOfCountry, loadState, scopeOf } from "@/lib/un/country-actions";
import { federalCountryOf } from "@/lib/un/federal-country";
import { appCountryDeps } from "@/lib/un/country-app";
import { RULESETS } from "@/lib/un/rulesets";
import { allCountries, countryIn, diffProfiles, diffRuns, diffSops, entityCountryOf, rulesetOf, sourceCounts, type CompanyRec, type Country, type PolicyRec, type RunResult } from "@/lib/un/country";
import ToolWorkspace from "../_components/ToolWorkspace";
import WorkspaceSections from "../_components/WorkspaceSections";
import { T, TV } from "../_components/Lang";
import { card, scrollRegion, Section } from "../_components/ui";
import { CountryPanel } from "./CountryPanel";
import { knownCountries } from "@/lib/un/country-context";
import CountryPolicy from "./CountryPolicy";
import { loadPolicy } from "@/lib/un/store";
import { countriesNeedingGovernanceAdmin } from "@/lib/un/people-agent";
import { loadAssignmentRows, loadUseCaseChoices } from "@/lib/un/roles-store";
import { Ct, En, GateList, Ltr, Rs, TX, Vd } from "../_components/b-bits";

export const metadata: Metadata = { title: "Country and knowledge base", robots: { index: false, follow: false } };
const chip = "inline-flex items-center rounded-md bg-paper-deep px-1.5 py-0.5 font-mono text-[11px]";
const short = (h: string) => h.slice(0, 10);
const idl = (a: string[]) => (a.length ? <Ltr>{a.join(", ")}</Ltr> : <T k="ub.none" en="none" />);
const enl = (a: string[]) => (a.length ? <En>{a.join("; ")}</En> : <T k="ub.none" en="none" />);

export default async function CountryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal/country");
  if (!profile?.org_id) redirect("/login");
  const { browseCountries } = await requireFederalToolAccess(profile.org_id, user.id, profile.role);
  const sp = await searchParams;
  const orgId = profile.org_id;
  const { data: org } = await createAdminClient().from("organizations").select("name").eq("id", orgId).maybeSingle();
  const d = appCountryDeps(orgId);
  const { entries, state, verified } = await loadState(d);
  const canEdit = isOrgAdmin(profile.role);
  const active = countryIn(state, state.active.country)!;
  const country = federalCountryOf(state, sp.country ?? sp.setup, browseCountries);
  const basePolicy = canEdit ? await loadPolicy(orgId) : null;
  const countryTarget = state.targets[country.id];
  const countryPolicy = basePolicy && (country.id === "UAE" ? basePolicy : {
    ...basePolicy, ...(countryTarget ?? { name: `${country.name}: agentic AI deployment`, jurisdiction: country.name, source_url: null, deadline: null }),
  });
  const canCompareCountries = mayCompareCountries(user.id, profile.role);

  const infos = await Promise.all(allCountries(state).map(async (c) => ({ c, info: await indexOfCountry(d, state, c.id) })));
  // what is required before the process can be run under a country: its policy, for every country that has no knowledge base yet
  const needs = infos.filter(({ c, info }) => c.id === country.id && !info).map(({ c }) => c);
  // a country that has entities must have a governance admin (they approve its targets and test sets): mandatory, so it is a required action
  const [choices, assignmentRows] = await Promise.all([loadUseCaseChoices(orgId), loadAssignmentRows(orgId)]);
  const needsGovernance = countriesNeedingGovernanceAdmin({ countriesWithEntities: choices.map((u) => entityCountryOf(state, u.entity)), assignments: assignmentRows }).includes(country.id);
  const scope = (await scopeOf(d, state, country.id)) ?? [];

  // every run: the logged ones, plus the two precomputed baselines of the built-in company when they are not logged yet
  const runs: { run: RunResult; logged: boolean; at?: string }[] = Object.values(state.runs).map((r) => ({ run: r, logged: true, at: r.at }));
  for (const id of ["UAE", "SG"]) if (!state.runs[`marsa:${id}`]) { const b = await baselineRun(d, state, id); if (b) runs.push({ run: b.run, logged: false }); }
  runs.sort((x, y) => x.run.key.localeCompare(y.run.key));
  const comparableRuns = runs.filter(({ run }) => canCompareCountries || run.country === country.id);
  const byKey = new Map(comparableRuns.map((r) => [r.run.key, r.run]));
  const lastCompany = Object.values(state.companies).at(-1);
  const defA = runs.find(({ run }) => run.country === country.id)?.run.key;
  const defB = !canCompareCountries || country.id !== "UAE" ? undefined : lastCompany ? `${lastCompany.id}:${lastCompany.country}` : "marsa:SG";
  const A = byKey.get(sp.a ?? defA ?? ""), B = byKey.get(sp.b ?? defB ?? "");
  const diff = A && B ? diffRuns(A, B) : null;
  const cA = A ? await companyView(d, state, A.company) : null, cB = B ? await companyView(d, state, B.company) : null;
  const sopDiff = cA && cB && A!.company !== B!.company ? diffSops(cA.lines, cB.lines) : null;
  const profDiff = cA && cB && A!.company !== B!.company ? diffProfiles(cA.profiles, cB.profiles) : null;

  const euStaged = (() => { try { return d.staged("kb/stage/eu").map((f) => ({ id: f.id, title: f.title, words: f.text.split(/\s+/).filter(Boolean).length })); } catch { return []; } })();
  const sources = sourceCounts(scope);
  const countryLog = entries.filter(({ kind, payload }) => {
    switch (kind) {
      case "switch": return payload.from === country.id || payload.to === country.id;
      case "run": return (payload.result as RunResult).country === country.id;
      case "country_added": return (payload.country as Country).id === country.id;
      case "policy_added": return (payload.policy as PolicyRec).country === country.id;
      case "company_onboarded": return (payload.company as CompanyRec).country === country.id;
      case "country_updated":
      case "country_target": return payload.id === country.id;
      case "entity_country": return payload.country === country.id || payload.from === country.id;
      case "entity_added":
      case "entity_goals":
      case "entity_hidden": return entityCountryOf(state, String(payload.name)) === country.id;
      case "reset": return true;
      default: return false;
    }
  });

  const selectedRuns = runs.filter(({ run }) => run.country === country.id);
  return (
    <ToolWorkspace country={country} orgName={org?.name} viewer={profile.role === "viewer"}
      title={<T k="cn.title" en="Country and knowledge base" />}
      description={<T k="workspace.country.description" en="Review policy sources, manage profiles, and compare staged runs." />}>
      <WorkspaceSections key={country.id} defaultSection={sp.a || sp.b ? "compare" : "now"} sections={[
        { id: "now", label: <T k="workspace.country.overview" en="Overview" />, anchors: ["indexes"], content: (
          <div className="space-y-5">
            <Section id="now" title={<T k="workspace.country.summary" en="Country overview" />}>
              <div className="rounded-lg bg-paper-deep p-4">
                <dl className="grid gap-3 text-sm sm:grid-cols-4">
                  {country.id === active.id && <div><dt className="text-ink-soft"><T k="cn.company" en="Company" /></dt><dd className="font-medium"><En>{(state.companies[state.active.company]?.name) ?? "Marsa Public Services Authority (fictitious)"}</En></dd></div>}
                  <div><dt className="text-ink-soft"><T k="cn.country" en="Country" /></dt><dd className="font-medium"><Ct id={country.id} en={country.name} />{country.currency && <span className="ms-2 text-ink-soft">{country.currency}</span>}</dd></div>
                  <div><dt className="text-ink-soft"><T k="cn.ruleset" en="Rule set" /></dt><dd className="font-mono"><Rs id={rulesetOf(country).id} /></dd></div>
                  <div><dt className="text-ink-soft"><T k="ub.cn.logdt" en="Log" /></dt><dd><Ltr>{countryLog.length}</Ltr> · {verified.ok ? <T k="ub.cn.verified" en="chain verified" /> : <TX k="ub.cn.broken" en="BROKEN at {n}" v={{ n: String(verified.broken_seq) }} />}</dd></div>
                </dl>

              </div>
            </Section>
          {canEdit && (needs.length > 0 || needsGovernance) && (
            <section aria-labelledby="req-h" data-testid="required-actions" className={`${card} mt-4`}>
              <h2 id="req-h" className="text-lg font-semibold"><T k="cn.req.h" en="Required actions" /></h2>
              <ul className="mt-2 space-y-1 text-sm">
                {needsGovernance && (
                  <li data-testid="needs-governance-admin">
                    <a className="underline" href="/admin/federal/people">
                      <TV k="cn.req.gov" en="{c}: appoint a governance admin. Targets and test sets cannot be approved there until one is." v={{ c: country.name }} />
                    </a>
                  </li>
                )}
                {needs.map((c) => (
                  <li key={c.id} className={(sp.setup ?? country.id) === c.id ? "font-medium" : ""}>
                    <a className="underline" href={c.custom ? `#docs-${c.id}` : "#step-a"}>
                      <TX k={c.custom ? "cn.req.custom" : "cn.req.eu"} en={c.custom ? "{c}: add its policy documents so the process can be run under its rules." : "{c}: add its policy (Step A) so the process can be run under its rules."} v={{ c: c.name }} />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
            <Section id="indexes" title={<T k="cn.scope" en="Knowledge base" />}>
              <div className="grid gap-3">
                {infos.filter(({ c }) => c.id === country.id).map(({ c, info }) => (
                  <div key={c.id} className="min-w-0">
                    <h3 className="font-medium"><Ct id={c.id} en={c.name} /> <span className={chip}><Rs id={rulesetOf(c).id} /></span></h3>
                    {info ? (
                      <>
                        <p className="mt-2 text-sm"><TX k="cn.ready" en="Index ready: {n} chunks from {s} sources, vectors {v}" v={{ n: info.chunks, s: info.sources, v: info.vectors ? <><Ltr>{info.vectors.have}/{info.vectors.of}</Ltr>{info.vectors.built ? <>, <T k="ub.cn.vbuilt" en="built" /> <Ltr>{info.vectors.built}</Ltr></> : null}</> : <T k="ub.none" en="none" /> }} /></p>
                        <p className="mt-1 text-xs text-ink-soft"><TX k="ub.cn.bm25" en="BM25: {d} docs, {t} terms (in memory, {ms} ms to build here)" v={{ d: info.bm25.docs, t: info.bm25.terms, ms: info.bm25.ms }} />{state.policies[c.id] ? <> · <TX k="ub.cn.live" en="built live in {ms} ms" v={{ ms: state.policies[c.id].total_ms }} /></> : c.built === "precomputed" ? <> · <T k="ub.cn.pre" en="precomputed" /></> : ""}</p>
                        <p className="mt-1 text-xs text-ink-soft" dir="ltr">{Object.entries(info.byJurisdiction).map(([j, n]) => `${j} ${n}`).join(" · ")}</p>
                        <p className="mt-2 text-xs text-ink-soft"><T k="ub.cn.gates" en="Gates:" /> <GateList ids={rulesetOf(c).gates} /></p>
                      </>
                    ) : <p className="mt-2 text-sm text-ink-soft"><T k="cn.noindex" en="No index yet: add this country's policy first." /></p>}
                  </div>
                ))}
              </div>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm underline"><TX k="ub.cn.sumry" en="{c}: {s} sources, {n} chunks" v={{ c: <Ct id={country.id} en={country.name} />, s: sources.length, n: scope.length }} /></summary>
                <div {...scrollRegion("cn-src")} className="mt-2 max-h-96 overflow-auto rounded-2xl border border-line bg-card">
                  <table className="w-full text-sm">
                    <caption id="cn-src" className="sr-only"><T k="ub.cn.src.cap" en="Sources in the active scope with chunk counts" /></caption>
                    <thead className="text-start font-mono text-[11px] uppercase"><tr><th scope="col" className="px-3 py-2 text-start font-normal"><T k="ub.kb.th.source" en="Source" /></th><th scope="col" className="text-start font-normal"><T k="ub.kb.th.jur" en="Jurisdiction" /></th><th scope="col" className="pe-3 text-end font-normal"><T k="ub.kb.th.chunks" en="Chunks" /></th></tr></thead>
                    <tbody>{sources.map((s) => <tr key={s.source_id} className="border-t border-line"><th scope="row" className="px-3 py-1.5 text-start font-normal"><a href={s.url} dir="ltr" lang="en" className="underline">{s.title.slice(0, 90)}</a> <bdi dir="ltr" className="font-mono text-[11px] text-ink-soft">{s.source_id}</bdi></th><td><En>{s.jurisdiction}</En></td><td className="pe-3 text-end"><Ltr>{s.chunks}</Ltr></td></tr>)}</tbody>
                  </table>
                </div>
              </details>
            </Section>
          <p role="note" className="mt-3 max-w-[68ch] rounded-lg border border-line bg-paper-deep p-3 text-sm">
            <T k="cn.limits" en="Honest limits: the rule sets are simplified demo encodings, not legal advice. Retrieval is lexical (BM25) plus vectors where they were built. The sample SOPs are synthetic and differ in a few details. All data is synthetic." />
          </p>
          </div>
        ) },
        ...(canEdit ? [{ id: "manage", label: <T k="workspace.country.manage" en="Manage countries" />, anchors: ["step-a", "docs-" + country.id], content: (
          <Section id="manage" title={<T k="workspace.country.manage" en="Manage countries" />}>
                  <CountryPanel key={country.id} canEdit={canEdit} active={active.id} selected={country.id}
                    countryOptions={{ en: knownCountries("en"), ar: knownCountries("ar") }}
                    countries={infos.map(({ c, info }) => ({ id: c.id, name: c.name, ruleset: c.ruleset, currency: c.currency, ready: !!info, onDemand: c.built === "on_demand", custom: !!c.custom, hidden: !!c.hidden }))}
                    rulesets={RULESETS.map((r) => ({ id: r.id, name: r.name }))} staged={euStaged} euBuilt={!!state.policies.EU} />
          </Section>
        ) }] : []),
        ...(countryPolicy ? [{ id: "policy", label: <T k="cn.setup.policy" en="Policy configuration" />, content: (
          <CountryPolicy key={country.id} policy={countryPolicy} noTarget={country.id !== "UAE" && !countryTarget} countryId={country.id} />
        ) }] : []),
        { id: "results", label: <T k="cn.results" en="Results" />, content: (
            <Section id="results" title={<T k="ub.cn.res.title" en="Results of the staged process (UC02)" />}>
              <div {...scrollRegion("cn-res")} className="overflow-x-auto rounded-2xl border border-line bg-card">
                <table className="w-full min-w-[56rem] text-sm">
                  <caption id="cn-res" className="sr-only"><T k="ub.cn.res.cap" en="Verdict per step for each company and country" /></caption>
                  <thead className="font-mono text-[11px] uppercase"><tr><th scope="col" className="px-3 py-2 text-start font-normal"><T k="ub.cn.th.cc" en="Company · country" /></th><th scope="col" className="text-start font-normal"><T k="cn.ruleset" en="Rule set" /></th><th scope="col" className="text-start font-normal"><T k="ub.cn.th.steps" en="Steps T0 to T4" /></th><th scope="col" className="text-start font-normal"><T k="ub.cn.th.final" en="Final" /></th><th scope="col" className="text-start font-normal"><T k="ub.cn.th.head" en="Head hash" /></th><th scope="col" className="pe-3 text-start font-normal"></th></tr></thead>
                  <tbody>
                    {!selectedRuns.length && <tr><td colSpan={6} className="px-3 py-4 text-sm text-ink-soft"><T k="workspace.country.noruns" en="No runs have been recorded for this country." /></td></tr>}
                    {selectedRuns.map(({ run: r, logged }) => (
                      <tr key={r.key} className="border-t border-line align-top">
                        <th scope="row" className="px-3 py-2 text-start font-normal"><En>{r.company_name}</En><span className="block text-xs text-ink-soft"><Ct id={r.country} en={countryIn(state, r.country)?.name ?? r.country} /> · <TX k="ub.cn.sopid" en="SOP {id}" v={{ id: <Ltr>{r.sop_id}</Ltr> }} /></span></th>
                        <td className="font-mono text-xs"><Rs id={r.ruleset} /></td>
                        <td className="text-xs">{r.steps.map((s, i) => <span key={i}>{i > 0 && <> <span aria-hidden className="inline-block rtl:rotate-180">→</span> </>}<Vd v={s.verdict} sp /></span>)}</td>
                        <td className="font-medium"><Vd v={r.final} sp /></td>
                        <td dir="ltr" className="text-start font-mono text-xs">{short(r.head_hash)}</td>
                        <td className="pe-3 text-xs text-ink-soft">{logged ? <T k="cn.logged" en="logged" /> : <T k="cn.computed" en="computed now (not logged)" />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-ink-soft"><T k="ub.cn.det" en="A run is deterministic: same country, rule set, sources and SOP give the same head hash, so switching back reproduces the stored result exactly. No model is called. The evidence events are the same five staged steps for every company; verdicts differ because the rule set differs." /></p>
              {selectedRuns.some(({ run }) => run.cited.length > 0) && (
                <details className="mt-4" open>
                  <summary className="cursor-pointer text-sm font-medium"><T k="ub.cn.cited" en="Cited sources, per run" /></summary>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {selectedRuns.filter(({ run }) => run.cited.length > 0).map(({ run: r }) => (
                      <div key={r.key} className={card}>
                        <h4 className="font-medium"><En>{r.company_name}</En> · <Ltr>{r.country}</Ltr></h4>
                        <ul className="mt-2 space-y-2 text-xs">{r.cited.map((c) => <li key={c.chunk_id}><bdi dir="ltr" className="font-mono">{c.chunk_id}</bdi> <span className={chip}>{c.from === "company_sop" ? <T k="ub.cn.companysop" en="company SOP" /> : <En>{c.jurisdiction}</En>}</span><span dir="ltr" lang="en" className="block text-start text-ink-soft">“{c.quote.slice(0, 200)}”</span></li>)}</ul>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </Section>
        ) },
        { id: "compare", label: <T k="cn.compare.go" en="Compare" />, content: (
            <Section id="compare" title={<T k="cn.compare" en="What changed between two runs" />}>
              <form method="get" action="#compare" className="flex flex-wrap items-end gap-3 text-sm">
                <input type="hidden" name="country" value={country.id} />
                {(["a", "b"] as const).map((k) => (
                  <label key={k}>{k === "a" ? <T k="ub.cn.A" en="A" /> : <T k="ub.cn.B" en="B" />}
                    <select key={`${k}:${A?.key}:${B?.key}`} name={k} defaultValue={k === "a" ? A?.key : B?.key} className="ms-2 max-w-full rounded-lg border border-line bg-paper px-2 py-1">
                      {comparableRuns.map(({ run: r }) => <option key={r.key} value={r.key}>{r.company_name.replace(/ \((fictitious|synthetic)\)/, "")} · {r.country}</option>)}
                    </select>
                  </label>
                ))}
                <button className="rounded-xl border border-line px-3 py-1.5" type="submit"><T k="cn.compare.go" en="Compare" /></button>
              </form>
              {diff && A && B && (
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className={card}>
                    <h3 className="font-medium"><T k="cn.diff.steps" en="Verdict per step" /></h3>
                    <table className="mt-2 w-full text-sm"><caption className="sr-only"><T k="ub.cn.cmp.cap" en="Verdict per step in the two runs" /></caption><thead className="font-mono text-[11px] uppercase"><tr><th scope="col" className="text-start font-normal"><T k="ub.cn.step" en="Step" /></th><th scope="col" className="text-start font-normal"><T k="ub.cn.A" en="A" /></th><th scope="col" className="text-start font-normal"><T k="ub.cn.B" en="B" /></th></tr></thead>
                      <tbody>{diff.steps.map((s) => <tr key={s.step} className="border-t border-line"><th scope="row" className="py-1 text-start font-normal">{s.step}</th><td><Vd v={s.a} sp /></td><td className={s.differs ? "font-medium" : ""}><Vd v={s.b} sp />{s.differs ? <T k="ub.cn.differs" en=" ◄ differs" /> : ""}</td></tr>)}</tbody></table>
                    <p className="mt-2 text-sm"><T k="ub.cn.final" en="Final:" /> <b><Vd v={diff.verdict.a} sp /></b> <T k="ub.cn.vs" en="vs" /> <b><Vd v={diff.verdict.b} sp /></b>{diff.verdict.differs ? <T k="ub.cn.differs2" en=" (differs)" /> : <T k="ub.cn.same" en=" (same)" />}</p>
                  </div>
                  <div className={card}>
                    <h3 className="font-medium"><T k="cn.diff.gates" en="Gates required" /></h3>
                    <p className="mt-2 text-sm"><TX k="ub.cn.onlyAR" en="Only in A ({rs}): {g}" v={{ rs: <Rs id={A.ruleset} />, g: <GateList ids={diff.gates.onlyA} /> }} /></p>
                    <p className="text-sm"><TX k="ub.cn.onlyBR" en="Only in B ({rs}): {g}" v={{ rs: <Rs id={B.ruleset} />, g: <GateList ids={diff.gates.onlyB} /> }} /></p>
                    <p className="text-sm text-ink-soft"><TX k="ub.cn.bothg" en="In both: {g}" v={{ g: <GateList ids={diff.gates.both} /> }} /></p>
                    <h3 className="mt-4 font-medium"><T k="cn.diff.sources" en="Cited sources" /></h3>
                    <p className="mt-2 text-xs"><TX k="ub.cn.srcA" en="Only A: {x}" v={{ x: idl(diff.sources.onlyA) }} /></p>
                    <p className="text-xs"><TX k="ub.cn.srcB" en="Only B: {x}" v={{ x: idl(diff.sources.onlyB) }} /></p>
                    <p className="text-xs text-ink-soft"><TX k="ub.cn.srcBoth" en="Both: {x}" v={{ x: idl(diff.sources.both) }} /></p>
                  </div>
                  {profDiff && (
                    <div className={card}>
                      <h3 className="font-medium"><T k="cn.diff.profiles" en="Job profiles" /></h3>
                      <p className="mt-2 text-sm"><TX k="ub.cn.profA" en="Only in A: {x}" v={{ x: enl(profDiff.onlyA) }} /></p>
                      <p className="text-sm"><TX k="ub.cn.profB" en="Only in B: {x}" v={{ x: enl(profDiff.onlyB) }} /></p>
                      <p className="text-sm text-ink-soft"><TX k="ub.cn.profT" en="Different task count: {x}" v={{ x: enl(profDiff.changed.map((c) => `${c.name} ${c.a} → ${c.b}`)) }} /></p>
                    </div>
                  )}
                  {sopDiff && (
                    <div className={`${card} lg:col-span-2`}>
                      <h3 className="font-medium"><T k="cn.diff.sop" en="What changed in the SOP (lines only in one of the two; names and ids neutralised)" /></h3>
                      <div className="mt-2 grid gap-3 text-xs sm:grid-cols-2">
                        <div><p className="font-medium"><T k="ub.cn.onlyA" en="Only in A" /></p><ul className="mt-1 space-y-1">{sopDiff.removed.map((l, i) => <li key={i} dir="ltr" lang="en" className="rounded bg-paper-deep p-1.5 text-start">{l.slice(0, 220)}</li>)}</ul></div>
                        <div><p className="font-medium"><T k="ub.cn.onlyB" en="Only in B" /></p><ul className="mt-1 space-y-1">{sopDiff.added.map((l, i) => <li key={i} dir="ltr" lang="en" className="rounded bg-paper-deep p-1.5 text-start">{l.slice(0, 220)}</li>)}</ul></div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Section>
        ) },
        { id: "log", label: <T k="workspace.country.audit" en="Audit log" />, content: (
            <Section id="log" title={<T k="cn.log" en="Hash-chained country log" />}>
              <div {...scrollRegion("cn-log")} className="max-h-80 overflow-auto rounded-2xl border border-line bg-card">
                <table className="w-full text-sm"><caption id="cn-log" className="sr-only"><T k="ub.cn.log.cap" en="Country log entries" /></caption>
                  <thead className="font-mono text-[11px] uppercase"><tr><th scope="col" className="px-3 py-2 text-start font-normal">#</th><th scope="col" className="text-start font-normal"><T k="ub.cn.log.kind" en="Kind" /></th><th scope="col" className="text-start font-normal"><T k="ub.cn.log.by" en="By" /></th><th scope="col" className="text-start font-normal"><T k="ub.cn.log.at" en="At (UTC)" /></th><th scope="col" className="pe-3 text-start font-normal"><T k="ub.cn.log.hash" en="Hash" /></th></tr></thead>
                  <tbody>{!countryLog.length && <tr><td colSpan={5} className="px-3 py-4 text-sm text-ink-soft"><T k="workspace.country.nolog" en="No audit entries for this country yet." /></td></tr>}{[...countryLog].reverse().map((e) => <tr key={e.seq} className="border-t border-line"><td className="px-3 py-1.5"><Ltr>{e.seq}</Ltr></td><td><T k={`ub.cn.k.${e.kind}`} en={e.kind} />{e.kind === "switch" ? <>: <Ltr>{String(e.payload.from)} → {String(e.payload.to)}</Ltr></> : e.kind === "run" ? <>: <Ltr>{(e.payload.result as RunResult).key}</Ltr> <Vd v={(e.payload.result as RunResult).final} /></> : ""}</td><td><Ltr>{e.actor}</Ltr></td><td dir="ltr" className="text-start font-mono text-xs">{e.at.slice(0, 19)}</td><td dir="ltr" className="pe-3 text-start font-mono text-xs">{short(e.hash)}</td></tr>)}</tbody>
                </table>
              </div>
            </Section>
        ) },
      ]} />
    </ToolWorkspace>
  );
}
