"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { UnUseCaseState } from "@/lib/un/model";
import { GOAL_ALIGNMENT_FORMULA, type EntityGoal } from "@/lib/un/goals";
import { CRITERIA, HARD, PROFILES, type Attestation, type Profile, type SijilRun, type Thresholds } from "@/lib/un/sijil";
import { Section, VerdictBadge, btnGhost, btnPrimary, card, field } from "../../_components/ui";
import { MetricChart, RejectBars, RunProgress, pct } from "./SijilCharts";

type Report = { id: string; runs: number; pass: boolean; content: string; sha256: string; created_at: string };

export default function SijilPanel({ uc, runs, goals, attestation: a, thresholds: th, target, liveMode, liveNode, reports, canEdit }: {
  uc: UnUseCaseState;
  runs: SijilRun[];
  /** The entity's seeded goals; empty until the migration and seed are applied. */
  goals: EntityGoal[];
  attestation: Attestation;
  thresholds: Thresholds;
  target: number;
  /** SIJIL_BASE_URL is set: runs are pulled from a live node. */
  liveMode: boolean;
  /** Node id the stored runs came from, if any. */
  liveNode: string | null;
  reports: Report[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>("healthy");
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [verifyFailed, setVerifyFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  async function call(method: string, body?: object, ok?: (d: Record<string, unknown>) => string) {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/admin/un/use-cases/${uc.id}/sijil`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    setBusy(false);
    setVerifyFailed(d.verified === false);
    if (res.ok) {
      setMsg({ ok: true, text: ok?.(d) ?? "Done." });
      router.refresh();
    } else setMsg({ ok: false, text: String(d.error ?? "Failed") });
  }

  const hasRuns = runs.length > 0;
  const rejectsIn = (r: SijilRun) => CRITERIA.reduce((n, c) => n + r.rejects[c], 0);
  const accOk = (r: SijilRun) => r.accuracy >= th.accuracy_min;
  const halOk = (r: SijilRun) => r.hallucination_rate <= th.hallucination_max;
  const aliOk = (r: SijilRun) => r.goal_alignment >= th.goal_alignment_min;
  const hardIn = (r: SijilRun) => HARD.reduce((n, c) => n + r.rejects[c], 0);
  const runOk = (r: SijilRun) => accOk(r) && halOk(r) && aliOk(r) && hardIn(r) === 0;
  const latest = reports[0] ?? null;

  const flag = (ok: boolean, text: string) => (
    <td className={`tabular-nums ${ok ? "" : "font-medium text-ember"}`}>{ok ? "" : <span aria-hidden>✕ </span>}{text}{ok ? "" : <span className="sr-only"> (outside threshold)</span>}</td>
  );

  return (
    <div className="space-y-12">
      <header>
        <Link href="/admin/federal" className="text-sm text-ink-soft underline underline-offset-2">← Federal dashboard</Link>
        <p className="mt-4 font-mono text-xs text-ink-soft">{uc.ext_id} · {uc.entity} · {uc.quadrant}{uc.client_facing ? " · client-facing" : ""}</p>
        <h1 className="font-display mt-1 text-3xl font-medium tracking-tight sm:text-4xl">{uc.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <VerdictBadge verdict={uc.verdict} size="lg" />
          <span className="text-ink-soft">stage <span className="font-mono text-ink">{uc.stage}</span></span>
          <span className="text-ink-soft">{uc.compliant ? "✓ compliant and aligned" : "not yet compliant"}</span>
        </div>
        {uc.hitl_rule && <p className="mt-3 max-w-[68ch] text-sm text-ink-soft">Human-in-the-loop rule: {uc.hitl_rule}</p>}
      </header>

      <Section
        eyebrow="Pilot attestation"
        title="Does the pilot pass?"
        aside={
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] tracking-widest uppercase ${verifyFailed ? "border-ember/60 text-ember" : "border-lit/50 bg-lit-soft/40 text-lit-deep"}`} title={liveMode ? "Sijil attests approvals and the record chain; accuracy, hallucination and goal alignment are simulated" : "No SIJIL_BASE_URL set; this adapter is simulated"}>
            <span aria-hidden>{liveMode ? (verifyFailed ? "✕" : "●") : "◌"}</span>
            {!liveMode ? "SIMULATED" : verifyFailed ? "LIVE: chain NOT verified" : `LIVE: Sijil node ${liveNode ?? "(not pulled yet)"}${liveNode ? ", chain verified" : ""}`}
          </span>
        }
        lede={liveMode ? "Approval and disclosure rejects come from the Sijil record chain (approval rejects are inferred). Accuracy, hallucination and goal alignment are simulated: Sijil does not measure them. The thresholds and hard criteria are the real rules." : "Synthetic runs only. Set SIJIL_BASE_URL to pull from a live Sijil node; the thresholds and hard criteria below are the real rules."}
      >
        <div className={`${card} flex flex-wrap items-center justify-between gap-4`}>
          <p role="status" className="flex items-center gap-3">
            <span className={`font-display text-3xl font-medium ${hasRuns ? (a.pass ? "text-lit-deep" : "text-ember") : "text-ink-soft"}`}>
              <span aria-hidden>{hasRuns ? (a.pass ? "✓ " : "✕ ") : "– "}</span>
              {hasRuns ? `Attestation ${a.pass ? "PASS" : "FAIL"}` : "No runs yet"}
            </span>
            <span className="text-sm text-ink-soft">{hasRuns ? `${runs.length} of ${target} runs` : `report is filed automatically at ${target}`}</span>
          </p>
          {hasRuns && !a.pass && (
            <ul className="max-w-[46ch] space-y-1 text-sm text-ember">
              {a.failing.map((f) => <li key={f}><span aria-hidden>✕ </span>{f}</li>)}
            </ul>
          )}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <MetricChart title="Inference accuracy" runs={runs} pick={(r) => r.accuracy} threshold={th.accuracy_min} kind="min" mean={a.means.accuracy} label={`mean across runs; at least ${pct(th.accuracy_min)}`} />
          <MetricChart title="Hallucination rate" runs={runs} pick={(r) => r.hallucination_rate} threshold={th.hallucination_max} kind="max" mean={a.means.hallucination_rate} label={`mean across runs; at most ${pct(th.hallucination_max)}`} />
          <MetricChart title="Goal alignment" runs={runs} pick={(r) => r.goal_alignment} threshold={th.goal_alignment_min} kind="min" mean={a.means.goal_alignment} label={`mean across runs; at least ${pct(th.goal_alignment_min)}`} />
        </div>
        {goals.length > 0 && (
          <div className={`${card} mt-4`}>
            <h3 className="text-sm font-medium">Entity goals behind goal alignment</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {goals.map((g) => (
                <li key={g.id}><span className="font-mono text-xs">{g.id}</span> {g.text} <span className="text-xs text-ink-soft">(measured by {g.criterion})</span></li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-soft">{GOAL_ALIGNMENT_FORMULA}. Computed from this run&apos;s rejects, not randomly.</p>
          </div>
        )}
        <p className="mt-3 text-xs text-ink-soft">
          {liveMode
            ? "Provenance: accuracy, hallucination and goal alignment are SIMULATED. Human final approval and AI disclosure rejects are FROM SIJIL (approval rejects inferred from approval records and flagged tool calls; disclosure is measured only if SIJIL_DISCLOSURE_RULE is set)."
            : "Provenance: every metric is SIMULATED (goal alignment is computed from the entity goals when they are seeded)."}
        </p>
        <div className={`${card} mt-4`}>
          <RunProgress runs={runs} target={target} runOk={runOk} filed={latest ? { pass: latest.pass, runs: latest.runs } : null} />
        </div>
      </Section>

      {canEdit && (
        <Section eyebrow="Configure" title={liveMode ? "Pull from Sijil" : "Run a pilot"} lede={liveMode ? "Verifies the node's hash chain, then imports one run per finished task. Nothing is imported or filed if verification fails." : "Pick how the simulated agent behaves, then run it. Results are scored per Prism criterion; at the target run count the report is filed and the result is written to the dashboard."}>
          <div className={`${card} flex flex-wrap items-end gap-4`}>
            {!liveMode && <><label className="min-w-64 flex-1 text-sm">
              <span className="font-medium">Simulated behaviour</span>
              <select value={profile} onChange={(e) => setProfile(e.target.value as Profile)} className={field}>
                {Object.entries(PROFILES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="font-medium">Runs</span>
              <select value={count} onChange={(e) => setCount(Number(e.target.value))} className={field}>
                {[5, 10, 30].map((n) => <option key={n}>{n}</option>)}
              </select>
            </label></>}
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => call("POST", { profile, count }, (d) => `${d.runs} runs on record${d.live ? " (chain verified)" : ""}.${d.filed ? ` Pilot report filed${d.applied ? "; compliance written to the dashboard" : ""}.` : ""}`)} className={btnPrimary}>{busy ? (liveMode ? "Pulling…" : "Running…") : liveMode ? "Pull from Sijil" : "Run pilot"}</button>
              <button disabled={busy || !hasRuns} onClick={() => call("PUT", undefined, () => "Interim report filed.")} className={btnGhost}>File report now</button>
              <button disabled={busy || !hasRuns} onClick={() => call("DELETE", undefined, () => "Runs cleared.")} className={btnGhost}>Reset runs</button>
            </div>
          </div>
          {msg && <p role="status" className={`mt-3 text-sm ${msg.ok ? "text-lit-deep" : "text-ember"}`}>{msg.ok ? "✓" : "✕"} {msg.text}</p>}
        </Section>
      )}

      <div className="grid gap-x-10 gap-y-12 lg:grid-cols-2">
        <Section eyebrow="Evidence" title="Rejects per criterion" lede="Each agent action that fails a Prism criterion counts as a reject. Hard criteria must be 0.">
          <div className={card}><RejectBars rejects={a.rejects} /></div>
        </Section>

        <Section eyebrow="Record" title={`Filed pilot reports (${reports.length})`}>
          <div className={card}>
            <ul className="space-y-3 text-sm">
              {reports.map((r, i) => (
                <li key={r.id} className="border-t border-line pt-3 first:border-0 first:pt-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${r.pass ? "border-lit/50 text-lit-deep" : "border-ember/60 text-ember"}`}>{r.pass ? "✓ PASS" : "✕ FAIL"}</span>
                      <span>{new Date(r.created_at).toLocaleString()} · {r.runs} runs{i === 0 ? " · latest" : ""}</span>
                    </span>
                    <button className="font-medium underline underline-offset-2" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Hide" : "View"}</button>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-ink-soft">sha256 {r.sha256.slice(0, 16)}…</p>
                  {open === r.id && <pre className="mt-2 max-h-96 overflow-auto rounded-lg border border-line bg-paper p-3 text-xs whitespace-pre-wrap">{r.content}</pre>}
                </li>
              ))}
              {!reports.length && <li className="text-ink-soft">None yet. The first report is filed when the run count reaches {target}, or on demand with “File report now”.</li>}
            </ul>
            {reports.length > 0 && <a href={`/api/admin/un/use-cases/${uc.id}/report`} className="mt-4 inline-block text-sm font-medium underline underline-offset-2">Download latest (Markdown)</a>}
          </div>
        </Section>
      </div>

      <Section eyebrow="Data" title={`Runs (${runs.length})`} lede={hasRuns ? "Latest first. ✕ marks a value outside its threshold or a hard-criterion reject; this table is the text version of the charts." : undefined}>
        <div className="relative max-h-[28rem] overflow-auto rounded-2xl border border-line bg-card">
          <table className="w-full min-w-[40rem] text-sm">
            <caption className="sr-only">Pilot runs with accuracy, hallucination, alignment and rejects</caption>
            <thead className="sticky top-0 bg-card text-left font-mono text-[11px] tracking-wide text-ink-soft uppercase shadow-[0_1px_0_var(--color-line)]">
              <tr>
                <th scope="col" className="px-4 py-3 font-normal">Run</th><th scope="col" className="font-normal">Actions</th>
                <th scope="col" className="font-normal">Accuracy</th><th scope="col" className="font-normal">Hallucination</th>
                <th scope="col" className="font-normal">Alignment</th><th scope="col" className="pr-4 font-normal">Rejects</th>
              </tr>
            </thead>
            <tbody>
              {[...runs].reverse().map((r) => (
                <tr key={r.run_no} className="border-t border-line">
                  <th scope="row" className="px-4 py-2 text-left font-mono text-xs font-normal">{r.run_no}</th>
                  <td className="tabular-nums">{r.actions}</td>
                  {flag(accOk(r), pct(r.accuracy))}
                  {flag(halOk(r), pct(r.hallucination_rate))}
                  {flag(aliOk(r), pct(r.goal_alignment))}
                  <td className={`pr-4 tabular-nums ${hardIn(r) ? "font-medium text-ember" : ""}`}>{hardIn(r) ? <span aria-hidden>✕ </span> : null}{rejectsIn(r)}{hardIn(r) ? <span className="sr-only"> (hard criterion breached)</span> : null}</td>
                </tr>
              ))}
              {!hasRuns && <tr><td colSpan={6} className="px-4 py-10 text-center text-ink-soft">No runs yet.{canEdit ? " Use “Run pilot” above." : ""}</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
