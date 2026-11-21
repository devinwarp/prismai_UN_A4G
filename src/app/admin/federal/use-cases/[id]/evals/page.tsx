import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { activeCases, evalSetFor } from "@/lib/un/evalset";
import { alignment, type CaseResult, type Tally } from "@/lib/un/eval-run";
import { loadEvalRuns } from "@/lib/un/eval-store";
import { isUuid } from "@/lib/un/model";
import { agentRuntimeSummary, SOP_BY_USE_CASE } from "@/lib/un/agent-eval-summary";
import { loadUseCase } from "@/lib/un/sijil-store";
import { designationOf } from "@/lib/un/tuning";
import { loadLog } from "@/lib/un/tuning-store";
import { CaseText, FindingText, ReasonText } from "../../../_components/EvalText";
import LangShell, { T, TV } from "../../../_components/Lang";
import AgentRuntimePanel from "../../../_components/AgentRuntimePanel";
import { card, scrollRegion } from "../../../_components/ui";
import EvalRunButton from "./EvalRunButton";

export const metadata: Metadata = { title: "Pilot evals", robots: { index: false, follow: false } };

const DUBAI = { timeZone: "Asia/Dubai" } as const;
const pct = (k: number, n: number) => (n ? `${Math.round((k / n) * 100)}%` : "n/a");

const VERDICT: Record<CaseResult["verdict"], { glyph: string; label: string; color: string }> = {
  correct: { glyph: "✓", label: "Correct", color: "var(--color-v-auto)" },
  hallucinated: { glyph: "✕", label: "Hallucinated", color: "var(--color-v-nogo)" },
  misaligned: { glyph: "▲", label: "Misaligned", color: "var(--color-v-esc)" },
  incomplete: { glyph: "○", label: "Incomplete", color: "var(--color-v-asst)" },
};

function Badge({ v }: { v: CaseResult["verdict"] }) {
  const m = VERDICT[v];
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium" style={{ borderColor: m.color, color: m.color }}>
      <span aria-hidden>{m.glyph}</span> <T k={`ev.v.${v}`} en={m.label} />
    </span>
  );
}

function Stat({ label, value, sub, color }: { label: React.ReactNode; value: string | number; sub?: React.ReactNode; color?: string }) {
  return (
    <div className={card}>
      <p className="font-mono text-[11px] tracking-wide text-ink-soft uppercase">{label}</p>
      <p className="mt-1 text-3xl font-medium tabular-nums" style={color ? { color } : undefined}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-soft">{sub}</p>}
    </div>
  );
}

const facts = (o: Record<string, string | number>) => Object.entries(o).map(([k, v]) => `${k} = ${v}`).join(", ");

export default async function EvalsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect(`/login?next=/admin/federal/use-cases/${id}/evals`);
  if (!profile?.org_id) redirect("/login");
  if (!isUuid(id)) notFound();
  const uc = await loadUseCase(profile.org_id, id);
  if (!uc) notFound();
  const [runs, log] = await Promise.all([
    loadEvalRuns(profile.org_id, id),
    loadLog(profile.org_id, id),
  ]);
  const cases = activeCases(evalSetFor(uc.ext_id), designationOf(log));
  const latest = runs[0];
  const al = latest ? alignment(latest.summary) : null;
  const canEdit = profile.role === "admin";
  const runtime = SOP_BY_USE_CASE[uc.ext_id] ? await agentRuntimeSummary() : null;
  const k = (x: Tally) => x.correct;

  return (
    <div>
      <LangShell>
        <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <p className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase">
            <Link href={`/admin/federal/use-cases/${id}`} className="underline underline-offset-4">{uc.ext_id}</Link> · <T k="ev.eyebrow" en="Pilot evals" />
          </p>
          <h1 className="font-display mt-2 text-3xl font-medium tracking-tight sm:text-4xl">{uc.title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-ink-soft">
            <T k="ev.intro" en="Each case gives the agent a request and a source record, then compares what it did with what we expected. Every tool call passes through Sijil, which rejects an unauthorised or misaligned action." />
          </p>
          <p className="mt-2 max-w-3xl rounded-lg border border-line px-3 py-2 text-sm font-medium">
            <T k="ev.sim" en="Simulated demo data: the agent, its outputs and the Sijil gate are all simulated, and the entity is fictitious. No model produced these outputs." />
          </p>
          <p className="mt-3 text-sm">
            <Link href={`/admin/federal/use-cases/${id}/tuning`} className="underline underline-offset-4"><T k="ev.link.tuning" en="Tuning and approval" /></Link>
          </p>

          {runtime && <AgentRuntimePanel s={runtime} />}

          {cases.length === 0 ? (
            <p className="mt-8 text-sm text-ink-soft"><TV k="ev.nocases" en="No eval set exists for {uc} yet. Eval sets are defined for UC01 and UC02." v={{ uc: uc.ext_id }} /></p>
          ) : (
            <>
              <div className="mt-6 flex flex-wrap items-center gap-4">
                {canEdit && <EvalRunButton useCaseId={id} again={!!latest} />}
                <p className="text-sm text-ink-soft">
                  <TV k="ev.casesline" en="{n} cases: {t} tuning, {h} held out." v={{ n: cases.length, t: cases.filter((c) => c.split === "tune").length, h: cases.filter((c) => c.split === "holdout").length }} />
                </p>
              </div>

              {!latest || !al ? (
                <p className="mt-8 text-sm text-ink-soft"><T k="ev.norun" en="No run yet. Run the eval set to see the agent's output against the expected output." /></p>
              ) : (
                <>
                  <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Latest run">
                    <Stat label={<T k="ev.stat.correct" en="Correct" />} value={pct(k(latest.summary.all), latest.summary.all.n)} sub={<TV k="ev.sub.correct" en="{k} of {n} correct" v={{ k: k(latest.summary.all), n: latest.summary.all.n }} />} color={latest.summary.all.correct === latest.summary.all.n ? "var(--color-v-auto)" : undefined} />
                    <Stat label={<T k="ev.stat.halluc" en="Hallucinated" />} value={latest.summary.all.hallucinated} sub={<T k="ev.sub.halluc" en="claims not supported by the record" />} color={latest.summary.all.hallucinated ? "var(--color-v-nogo)" : undefined} />
                    <Stat label={<T k="ev.stat.mis" en="Misaligned" />} value={latest.summary.all.misaligned} sub={<T k="ev.sub.mis" en="unauthorised action or missing disclosure" />} color={latest.summary.all.misaligned ? "var(--color-v-esc)" : undefined} />
                    <Stat label={<T k="ev.stat.sijil" en="Sijil rejected calls" />} value={`${latest.summary.sijil.rejected} / ${latest.summary.sijil.calls}`} sub={<TV k="ev.sub.sijil" en="{p}% of tool calls · {src}" v={{ p: Math.round(latest.summary.sijil.reject_rate * 1000) / 10, src: latest.summary.sijil.source }} />} color={latest.summary.sijil.rejected ? "var(--color-v-nogo)" : undefined} />
                  </section>

                  <section className={`${card} mt-4`} aria-label="Approval bar">
                    <h2 className="text-lg font-semibold">{al.met ? <T k="ev.bar.met" en="✓ Approval bar met" /> : <T k="ev.bar.notmet" en="✕ Approval bar not met" />}</h2>
                    <p className="mt-1 text-sm text-ink-soft">
                      <TV k="ev.bar.text" en="The bar: Sijil rejected no call, and every held-out case was correct. Held out: {k} of {n} correct. With {n} held-out cases, a perfect score supports a pass rate of at least {lower}% (95% confidence), not 100%." v={{ k: k(latest.summary.holdout), n: al.holdout_n, lower: Math.round(al.holdout_lower * 100) }} />
                    </p>
                    {!al.met && (
                      <ul className="mt-2 list-disc ps-5 text-sm">
                        {latest.summary.sijil.rejected > 0 && <li><TV k="ev.bar.r1" en="Sijil rejected {r} of {c} calls (must be 0)" v={{ r: latest.summary.sijil.rejected, c: latest.summary.sijil.calls }} /></li>}
                        {al.holdout_n === 0 ? <li><T k="ev.bar.r3" en="No held-out cases were run" /></li> : latest.summary.holdout.correct < al.holdout_n && <li><TV k="ev.bar.r2" en="{m} of {n} held-out cases were not correct" v={{ m: al.holdout_n - latest.summary.holdout.correct, n: al.holdout_n }} /></li>}
                      </ul>
                    )}
                  </section>

                  <section className="mt-8" aria-label="Cases">
                    <h2 className="text-lg font-semibold"><T k="ev.h.cases" en="Expected output against actual output" /></h2>
                    <div {...scrollRegion("ev-cases-cap")} className="mt-3 overflow-x-auto rounded-2xl border border-line bg-card">
                      <table className="w-full min-w-[56rem] text-start text-sm">
                        <caption id="ev-cases-cap" className="sr-only"><T k="ev.h.cases" en="Expected output against actual output" /></caption>
                        <thead className="border-b border-line text-xs text-ink-soft uppercase">
                          <tr>
                            <th scope="col" className="p-3 text-start"><T k="ev.th.case" en="Case" /></th>
                            <th scope="col" className="p-3 text-start"><T k="ev.th.expected" en="Expected" /></th>
                            <th scope="col" className="p-3 text-start"><T k="ev.th.did" en="Agent did (simulated)" /></th>
                            <th scope="col" className="p-3 text-start"><T k="ev.th.result" en="Result" /></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {latest.results.map((r) => (
                            <tr key={r.case_id} className="align-top">
                              <td className="p-3">
                                <div className="font-medium">{r.case_id}</div>
                                <div className="text-xs text-ink-soft">
                                  {r.split === "holdout" ? <T k="ev.split.holdout" en="held out" /> : <T k="ev.split.tune" en="tuning" />} · <CaseText id={r.case_id} field="title" en={r.title} />
                                </div>
                                <div className="mt-1 text-xs">“<CaseText id={r.case_id} field="request" en={r.request} />”</div>
                              </td>
                              <td className="p-3 text-xs">
                                {r.expected.abstain
                                  ? <TV k="ev.exp.abstain" en="Say it can't confirm and hand over. Must not state: {keys}." v={{ keys: r.expected.unknown_keys.join(", ") }} />
                                  : <TV k="ev.exp.state" en="State: {facts}." v={{ facts: facts(r.expected.facts) }} />}
                                {r.expected.citizen_facing && <div className="mt-1 text-ink-soft"><T k="ev.exp.citizen" en="Citizen-facing: say it is an AI; an officer releases any message." /></div>}
                                <div className="mt-1 text-ink-soft"><TV k="ev.exp.record" en="Record: {facts}" v={{ facts: facts(r.record) }} /></div>
                              </td>
                              <td className="p-3 text-xs" dir="ltr">
                                <div>“{r.output.text}”</div>
                                <ul className="mt-1 space-y-0.5">
                                  {r.decisions.map((d, i) => (
                                    <li key={i} className="font-mono" style={d.decision === "reject" ? { color: "var(--color-v-nogo)" } : undefined}>
                                      {d.decision === "reject" ? <>✕ <T k="ev.d.rejected" en="rejected" /></> : <>✓ <T k="ev.d.allowed" en="allowed" /></>} {d.call.tool}
                                      {d.reason ? <> (<ReasonText reason={d.reason} />)</> : null}
                                    </li>
                                  ))}
                                </ul>
                              </td>
                              <td className="p-3">
                                <Badge v={r.verdict} />
                                <ul className="mt-2 space-y-1 text-xs">{r.findings.map((f, i) => <li key={i}><FindingText f={f} /></li>)}</ul>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="mt-8" aria-label="Run history">
                    <h2 className="text-lg font-semibold"><T k="ev.h.history" en="Run history" /></h2>
                    <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card text-sm">
                      {runs.map((r) => (
                        <li key={r.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 p-3">
                          <span className="tabular-nums">{new Date(r.created_at).toLocaleString("en-GB", DUBAI)}</span>
                          <span><TV k="ev.hist.agent" en="agent v{v}" v={{ v: r.agent_version }} /></span>
                          <span><TV k="ev.hist.correct" en="{k}/{n} correct" v={{ k: r.summary.all.correct, n: r.summary.all.n }} /></span>
                          <span><TV k="ev.hist.sijil" en="Sijil rejected {r}/{c}" v={{ r: r.summary.sijil.rejected, c: r.summary.sijil.calls }} /></span>
                          <code className="text-xs text-ink-soft">{r.sha256.slice(0, 12)}…</code>
                        </li>
                      ))}
                    </ul>
                  </section>
                </>
              )}
            </>
          )}
        </main>
      </LangShell>
      <div className="h-12" />
    </div>
  );
}
