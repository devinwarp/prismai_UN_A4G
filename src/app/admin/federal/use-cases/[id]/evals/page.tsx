import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { evalSetFor } from "@/lib/un/evalset";
import { alignment, type CaseResult, type Tally } from "@/lib/un/eval-run";
import { loadEvalRuns } from "@/lib/un/eval-store";
import { isUuid } from "@/lib/un/model";
import { loadUseCase } from "@/lib/un/sijil-store";
import AdminHeader from "../../../../AdminHeader";
import { card } from "../../../_components/ui";
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
      <span aria-hidden>{m.glyph}</span> {m.label}
    </span>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className={card}>
      <p className="font-mono text-[11px] tracking-wide text-ink-soft uppercase">{label}</p>
      <p className="mt-1 text-3xl font-medium tabular-nums" style={color ? { color } : undefined}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-soft">{sub}</p>}
    </div>
  );
}

const facts = (o: Record<string, string | number>) => (Object.keys(o).length ? Object.entries(o).map(([k, v]) => `${k} = ${v}`).join(", ") : "none");

export default async function EvalsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect(`/login?next=/admin/federal/use-cases/${id}/evals`);
  if (!profile?.org_id) redirect("/login");
  if (!isUuid(id)) notFound();
  const uc = await loadUseCase(profile.org_id, id);
  if (!uc) notFound();
  const [{ data: org }, runs] = await Promise.all([
    createAdminClient().from("organizations").select("name").eq("id", profile.org_id).maybeSingle(),
    loadEvalRuns(profile.org_id, id),
  ]);
  const cases = evalSetFor(uc.ext_id);
  const latest = runs[0];
  const al = latest ? alignment(latest.summary) : null;
  const canEdit = profile.role === "admin";
  const t = (x: Tally) => `${x.correct}/${x.n} correct`;

  return (
    <div className="conduit-bg min-h-dvh">
      <AdminHeader active="federal" orgName={org?.name} viewer={profile.role === "viewer"} />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase">
          <Link href={`/admin/federal/use-cases/${id}`} className="underline underline-offset-4">{uc.ext_id}</Link> · Pilot evals
        </p>
        <h1 className="font-display mt-2 text-3xl font-medium tracking-tight sm:text-4xl">{uc.title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink-soft">
          Each case gives the agent a request and a source record, then compares what it did with what we expected. Every tool call passes
          through Sijil, which rejects an unauthorised or misaligned action. <strong>Simulated demo data:</strong> the agent and the Sijil gate
          are simulated, and the entity is fictitious.
        </p>

        {cases.length === 0 ? (
          <p className="mt-8 text-sm text-ink-soft">No eval set exists for {uc.ext_id} yet. Eval sets are defined for UC01 and UC02.</p>
        ) : (
          <>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              {canEdit && <EvalRunButton useCaseId={id} label={latest ? "Run the eval set again" : "Run the eval set"} />}
              <p className="text-sm text-ink-soft">{cases.length} cases: {cases.filter((c) => c.split === "tune").length} tuning, {cases.filter((c) => c.split === "holdout").length} held out.</p>
            </div>

            {!latest || !al ? (
              <p className="mt-8 text-sm text-ink-soft">No run yet. Run the eval set to see the agent&apos;s output against the expected output.</p>
            ) : (
              <>
                <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Latest run">
                  <Stat label="Correct" value={pct(latest.summary.all.correct, latest.summary.all.n)} sub={t(latest.summary.all)} color={latest.summary.all.correct === latest.summary.all.n ? "var(--color-v-auto)" : undefined} />
                  <Stat label="Hallucinated" value={latest.summary.all.hallucinated} sub="claims not supported by the record" color={latest.summary.all.hallucinated ? "var(--color-v-nogo)" : undefined} />
                  <Stat label="Misaligned" value={latest.summary.all.misaligned} sub="unauthorised action or missing disclosure" color={latest.summary.all.misaligned ? "var(--color-v-esc)" : undefined} />
                  <Stat label="Sijil rejected calls" value={`${latest.summary.sijil.rejected} of ${latest.summary.sijil.calls}`} sub={`${Math.round(latest.summary.sijil.reject_rate * 1000) / 10}% of tool calls · ${latest.summary.sijil.source}`} color={latest.summary.sijil.rejected ? "var(--color-v-nogo)" : undefined} />
                </section>

                <section className={`${card} mt-4`} aria-label="Approval bar">
                  <h2 className="text-lg font-semibold">{al.met ? "✓ Approval bar met" : "✕ Approval bar not met"}</h2>
                  <p className="mt-1 text-sm text-ink-soft">
                    The bar: Sijil rejected no call, and every held-out case was correct. Held out: {t(latest.summary.holdout)}.
                    With {al.holdout_n} held-out cases, a perfect score supports a pass rate of at least {Math.round(al.holdout_lower * 100)}% (95% confidence), not 100%.
                  </p>
                  {al.reasons.length > 0 && (
                    <ul className="mt-2 list-disc ps-5 text-sm">{al.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                  )}
                </section>

                <section className="mt-8" aria-label="Cases">
                  <h2 className="text-lg font-semibold">Expected output against actual output</h2>
                  <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-card">
                    <table className="w-full min-w-[56rem] text-start text-sm">
                      <caption className="sr-only">Each eval case with the expected output, the agent&apos;s actual output, the result and any findings</caption>
                      <thead className="border-b border-line text-xs text-ink-soft uppercase">
                        <tr>
                          <th scope="col" className="p-3 text-start">Case</th>
                          <th scope="col" className="p-3 text-start">Expected</th>
                          <th scope="col" className="p-3 text-start">Agent did</th>
                          <th scope="col" className="p-3 text-start">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {latest.results.map((r) => (
                          <tr key={r.case_id} className="align-top">
                            <td className="p-3">
                              <div className="font-medium">{r.case_id}</div>
                              <div className="text-xs text-ink-soft">{r.split === "holdout" ? "held out" : "tuning"} · {r.title}</div>
                              <div className="mt-1 text-xs">“{r.request}”</div>
                            </td>
                            <td className="p-3 text-xs">
                              {r.expected.abstain ? <>Say it can&apos;t confirm and hand over. Must not state: {r.expected.unknown_keys.join(", ")}.</> : <>State: {facts(r.expected.facts)}.</>}
                              {r.expected.citizen_facing && <div className="mt-1 text-ink-soft">Citizen-facing: say it is an AI; an officer releases any message.</div>}
                              <div className="mt-1 text-ink-soft">Record: {facts(r.record)}</div>
                            </td>
                            <td className="p-3 text-xs">
                              <div>“{r.output.text}”</div>
                              <ul className="mt-1 space-y-0.5">
                                {r.decisions.map((d, i) => (
                                  <li key={i} className="font-mono" style={d.decision === "reject" ? { color: "var(--color-v-nogo)" } : undefined}>
                                    {d.decision === "reject" ? "✕ rejected" : "✓ allowed"} {d.call.tool}{d.reason ? ` (${d.reason})` : ""}
                                  </li>
                                ))}
                              </ul>
                            </td>
                            <td className="p-3">
                              <Badge v={r.verdict} />
                              <ul className="mt-2 space-y-1 text-xs">{r.findings.map((f, i) => <li key={i}>{f.detail}</li>)}</ul>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="mt-8" aria-label="Run history">
                  <h2 className="text-lg font-semibold">Run history</h2>
                  <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card text-sm">
                    {runs.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 p-3">
                        <span className="tabular-nums">{new Date(r.created_at).toLocaleString("en-GB", DUBAI)}</span>
                        <span>agent v{r.agent_version}</span>
                        <span>{r.summary.all.correct}/{r.summary.all.n} correct</span>
                        <span>Sijil rejected {r.summary.sijil.rejected}/{r.summary.sijil.calls}</span>
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
      <div className="h-12" />
    </div>
  );
}
