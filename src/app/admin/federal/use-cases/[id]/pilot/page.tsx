import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { isUuid } from "@/lib/un/model";
import { permissionsFor } from "@/lib/un/permissions-server";
import { approversForUseCase } from "@/lib/un/approvers-store";
import { replayReviews } from "@/lib/un/goal-judge";
import { loadPilots, loadReviewLog } from "@/lib/un/pilot-store";
import { replayGen } from "@/lib/un/testgen";
import { loadGenLog } from "@/lib/un/testgen-store";
import { loadAttachedSop, loadProfileRows } from "@/lib/un/profiles-store";
import { loadUseCase } from "@/lib/un/sijil-store";
import { profilesForUseCase } from "@/lib/un/sop-version-store";
import LangShell, { T, TV } from "../../../_components/Lang";
import { card, scrollFocus, VerdictBadge } from "../../../_components/ui";
import { AgentLine } from "./AgentLine";
import { GeneratedCases } from "./GeneratedCases";
import { GoalReview } from "./GoalReview";
import { RunPilot } from "./PilotControls";
import { SealLine } from "../../../_components/SealLine";

export const metadata: Metadata = { title: "Pilot and verdict", robots: { index: false, follow: false } };

const pct = (v: number | null) => (v === null ? "–" : `${(v * 100).toFixed(1)}%`);
const plain = (m: string) => m.includes("latency") || m.includes("rejected") || m.includes("cost");

export default async function PilotPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ profile?: string }> }) {
  const [{ id }, { profile: pick }] = await Promise.all([params, searchParams]);
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect(`/login?next=/admin/federal/use-cases/${id}/pilot`);
  if (!profile?.org_id) redirect("/login");
  if (!isUuid(id)) notFound();
  const uc = await loadUseCase(profile.org_id, id);
  if (!uc) notFound();
  const perms = await permissionsFor(profile, user.id);
  const mayRun = perms.can("pilot.run", id);
  const mayApproveGoals = perms.can("goals.approve", id);

  const sopId = await loadAttachedSop(profile.org_id, id);
  const names = new Set(sopId ? (await loadProfileRows(profile.org_id, id, sopId)).filter((r) => r.automate).map((r) => r.profile) : []);
  const profiles = ((sopId && (await profilesForUseCase(profile.org_id, id, sopId))) || []).filter((p) => names.has(p.name));
  const current = profiles.find((p) => p.name === pick) ?? profiles[0] ?? null;
  const pilots = current ? await loadPilots(profile.org_id, id, current.name) : [];
  const last = pilots[0] ?? null;
  const original = pilots.find((p) => !p.basis) ?? null;
  const review = original && current ? (replayReviews(await loadReviewLog(profile.org_id, id, current.name)).reviews[original.id] ?? null) : null;
  const approvers = (await approversForUseCase(profile.org_id, id)).map((a) => ({ title: a.title, source: a.source }));
  // rulings on disputed generated cases (the proposal log); the page still shows the pilot when that log cannot be read
  const rulings = current && original?.report.generated ? await loadGenLog(profile.org_id, id, current.name).then((l) => replayGen(l, []).rulings).catch(() => []) : [];

  return (
    <LangShell>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase"><T k="pi.eyebrow" en="Pilot and verdict" /></p>
        <h1 className="font-display mt-2 text-3xl font-medium tracking-tight sm:text-4xl"><TV k="pi.h1" en="What the pilot of {uc} measured" v={{ uc: uc.ext_id }} /></h1>
        <p className="mt-3 max-w-[68ch] text-base text-ink-soft"><T k="pi.lede" en="The approved tests run on the real agent, under the approved thresholds. Tests with no executable case are listed, not scored. The verdict below rests on the measured gates only; reviewer gates are not recorded here yet." /></p>
        <p className="mt-3"><Link className="text-sm underline" href={`/admin/federal/use-cases/${id}/tests${current ? `?profile=${encodeURIComponent(current.name)}` : ""}`}><T k="pi.tests" en="Tests and verdict parameters" /></Link><Link className="ms-4 text-sm underline" href={`/admin/federal/use-cases/${id}/improve`}><T k="im.link" en="Improve the agent" /></Link></p>

        {!current ? (
          <section className={`${card} mt-6`}><p className="text-sm font-medium"><T k="ts.none" en="Attach an SOP and tick Automate on a job profile first: tests are written for the agent that will do its work." /></p></section>
        ) : (
          <>
            <nav aria-label="Job profile" className="mt-6 flex flex-wrap gap-2">
              {profiles.map((p) => (
                <Link key={p.name} href={`/admin/federal/use-cases/${id}/pilot?profile=${encodeURIComponent(p.name)}`} aria-current={p.name === current.name ? "page" : undefined} className={`rounded-full border px-3 py-1 text-sm ${p.name === current.name ? "border-ink font-medium" : "border-line"}`}>{p.name}</Link>
              ))}
            </nav>

            <section className={`${card} mt-6`} aria-labelledby="pi-run">
              <h2 id="pi-run" className="font-display text-xl font-medium">{current.name}</h2>
              {mayRun ? <div className="mt-3"><RunPilot useCaseId={id} profile={current.name} /></div> : <p className="mt-3 text-sm font-medium"><T k="pi.readonly" en="Read only. Running the pilot needs the pilot run permission." /></p>}
            </section>

            {!last ? (
              <p className="mt-6 text-sm"><T k="pi.none" en="No pilot has been run for this profile." /></p>
            ) : (
              <section className={`${card} mt-6`} aria-labelledby="pi-last">
                <h2 id="pi-last" className="font-display text-xl font-medium"><T k="pi.last" en="Latest pilot" /></h2>
                {last.basis && <p className="mt-1 text-xs text-ink-soft"><T k="pi.recomputed" en="Recomputed with the approved goal judgments." /></p>}
                <p className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                  <VerdictBadge verdict={last.report.verdict} />
                  <span>{last.report.conclusive ? <T k="pi.conclusive" en="Conclusive" /> : <T k="pi.inconclusive" en="Inconclusive: the sample is too small to pass anything" />}</span>
                </p>
                <p className="mt-2 text-xs text-ink-soft"><TV k="pi.meta" en="{runs} runs ({reps} repetitions of each test) · {at} · {by}" v={{ runs: last.runs, reps: last.reps, at: new Date(last.at).toLocaleString("en-GB", { timeZone: "Asia/Dubai" }), by: last.actor }} /></p>
                {last.plan.agent && <AgentLine agent={last.plan.agent} />}
                <SealLine sijil={last.plan.sijil} />
                {last.plan.inference_blocks && (
                  <p className="mt-1 text-xs text-ink-soft">
                    <TV k="pi.screen" en="Pre-inference screening (Sijil node): {total} block(s) screened against rules and recorded — {attacks} attack(s) stopped, {alignment} alignment block(s){rules}"
                      v={{ total: last.plan.inference_blocks.total, attacks: last.plan.inference_blocks.attacks_stopped, alignment: last.plan.inference_blocks.alignment, rules: Object.keys(last.plan.inference_blocks.by_rule).length ? ` · ${Object.keys(last.plan.inference_blocks.by_rule).join(", ")}` : "" }} />
                  </p>
                )}
                <p className="mt-1 font-mono text-[11px] text-ink-soft">tests {last.report.test_set_hash.slice(0, 12)} · params {last.report.params_hash.slice(0, 12)} · report {last.report.report_hash.slice(0, 12)}</p>

                <div className="mt-4 overflow-x-auto" role="region" {...scrollFocus} aria-label="Findings">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-ink-soft">
                        <th className="py-1 pe-3 text-start font-normal"><T k="pi.th.measure" en="Measure" /></th>
                        <th className="py-1 pe-3 text-start font-normal"><T k="pi.th.value" en="Observed" /></th>
                        <th className="py-1 pe-3 text-start font-normal"><T k="pi.th.threshold" en="Threshold" /></th>
                        <th className="py-1 text-start font-normal"><T k="pi.th.result" en="Result" /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {last.report.findings.map((f) => (
                        <tr key={f.measure} className="border-t border-line align-top">
                          <td className="py-1 pe-3">{f.measure}</td>
                          <td className="py-1 pe-3 tabular-nums">{plain(f.measure) ? (f.value ?? "–") : pct(f.value)}</td>
                          <td className="py-1 pe-3 tabular-nums">{f.op} {f.threshold === null ? "–" : plain(f.measure) ? f.threshold : pct(f.threshold)}</td>
                          <td className="py-1">
                            {f.ok === null ? <T k="pi.noset" en="No threshold" /> : f.ok ? <T k="pi.ok" en="Holds" /> : <T k="pi.fail" en="Fails" />}
                            {f.note ? <span className="text-xs text-ink-soft"> · {f.note}</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {last.report.insufficient.length > 0 && (
                  <div className="mt-4"><p className="text-sm font-medium"><T k="pi.insufficient" en="Why the sample is not enough" /></p><ul className="mt-1 list-disc ps-5 text-sm">{last.report.insufficient.map((s) => <li key={s}>{s}</li>)}</ul></div>
                )}
                {last.plan.unexecuted.length > 0 && (
                  <div className="mt-4">
                    <details>
                      <summary className="cursor-pointer text-sm font-medium"><TV k="pi.unexec" en="Tests that could not be executed ({n})" v={{ n: last.plan.unexecuted.length }} /></summary>
                      <ul className="mt-1 list-disc ps-5 text-xs text-ink-soft">{last.plan.unexecuted.slice(0, 30).map((u) => <li key={u.id}>{u.id}: {u.why}</li>)}</ul>
                    </details>
                  </div>
                )}
                {original && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium"><TV k="pi.testlist" en="Every test that ran ({n}): open one to see the whole chain" v={{ n: Object.values(original.plan.bound).reduce((n, c) => n + c.length, 0) }} /></summary>
                    <ul className="mt-2 columns-1 gap-6 font-mono text-xs sm:columns-2">
                      {Object.entries(original.plan.bound).flatMap(([bp, cases]) => cases.map((c) => `${bp}#${c}`)).map((t) => (
                        <li key={t}><Link className="underline" href={`/admin/federal/use-cases/${id}/pilot/test?profile=${encodeURIComponent(current.name)}&pilot=${original.id}&test=${encodeURIComponent(t)}`}>{t}</Link></li>
                      ))}
                    </ul>
                  </details>
                )}
                {last.report.reasons.length > 0 && (
                  <div className="mt-4"><p className="text-sm font-medium"><T k="pi.reasons" en="Reasons for the verdict" /></p><ul className="mt-1 list-disc ps-5 text-sm">{last.report.reasons.map((r) => <li key={r}>{r}</li>)}</ul></div>
                )}
              </section>
            )}
            {original?.report.generated && current && <GeneratedCases useCaseId={id} profile={current.name} pilotId={original.id} block={original.report.generated} rulings={rulings} mayRule={mayApproveGoals} />}
            {original && <GoalReview useCaseId={id} profile={current.name} pilotId={original.id} review={review} approvers={approvers} mayRun={mayRun} mayApprove={mayApproveGoals} modelConfigured={!!(process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY)} />}
          </>
        )}
      </main>
    </LangShell>
  );
}
