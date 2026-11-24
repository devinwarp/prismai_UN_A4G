"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { UnUseCaseState } from "@/lib/un/model";
import { GOAL_ALIGNMENT_FORMULA, type EntityGoal } from "@/lib/un/goals";
import { CRITERIA, HARD, PROFILES, type Attestation, type Profile, type SijilRun, type Thresholds } from "@/lib/un/sijil";
import { tr } from "@/lib/un/i18n/dict";
import { useLang } from "../../_components/Lang";
import { scrollRegion, Section, btnGhost, btnPrimary, card, field } from "../../_components/ui";
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
  const lang = useLang();
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
      setMsg({ ok: true, text: ok?.(d) ?? tr(lang, "uc.sj.done", "Done.") });
      router.refresh();
    } else setMsg({ ok: false, text: String(d.error ?? tr(lang, "uc.sj.failed", "Failed")) });
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
    <td className={`tabular-nums ${ok ? "" : "font-medium text-ember"}`}>{ok ? "" : <span aria-hidden>✕ </span>}{text}{ok ? "" : <span className="sr-only"> {tr(lang, "uc.sj.outside", "(outside threshold)")}</span>}</td>
  );

  return (
    <div className="space-y-12">
      {uc.hitl_rule && <p className="max-w-[68ch] text-sm text-ink-soft">{tr(lang, "uc.sj.hitl", "Human-in-the-loop rule:")} {uc.hitl_rule}</p>}

      <Section
        eyebrow={liveMode ? tr(lang, "uc.sj.eyebrow", "Pilot attestation") : tr(lang, "uc.sj.eyebrow_sim", "Pilot attestation · simulated")}
        title={tr(lang, "uc.sj.title", "Does the pilot pass?")}
        aside={
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] tracking-widest uppercase ${verifyFailed ? "border-ember/60 text-ember" : "border-lit/50 bg-lit-soft/40 text-lit-deep"}`} title={liveMode ? tr(lang, "uc.sj.badge_live_t", "Sijil attests approvals and the record chain; accuracy, hallucination and goal alignment are simulated") : tr(lang, "uc.sj.badge_sim_t", "No SIJIL_BASE_URL set; this adapter is simulated")}>
            <span aria-hidden>{liveMode ? (verifyFailed ? "✕" : "●") : "◌"}</span>
            {!liveMode ? tr(lang, "uc.sj.simulated", "SIMULATED") : verifyFailed ? tr(lang, "uc.sj.live_bad", "LIVE: chain NOT verified") : `${tr(lang, "uc.sj.live_node", "LIVE: Sijil node")} ${liveNode ?? tr(lang, "uc.sj.not_pulled", "(not pulled yet)")}${liveNode ? tr(lang, "uc.sj.chain_ok", ", chain verified") : ""}`}
          </span>
        }
        lede={liveMode ? tr(lang, "uc.sj.lede_live", "Approval and disclosure rejects come from the Sijil record chain (approval rejects are inferred). Accuracy, hallucination and goal alignment are simulated: Sijil does not measure them. The thresholds and hard criteria are the real rules.") : tr(lang, "uc.sj.lede_sim", "Synthetic runs only. Set SIJIL_BASE_URL to pull from a live Sijil node; the thresholds and hard criteria below are the real rules.")}
      >
        <div className={`${card} flex flex-wrap items-center justify-between gap-4`}>
          <p role="status" className="flex items-center gap-3">
            <span className={`font-display text-3xl font-medium ${hasRuns ? (a.pass ? "text-lit-deep" : "text-ember") : "text-ink-soft"}`}>
              <span aria-hidden>{hasRuns ? (a.pass ? "✓ " : "✕ ") : "– "}</span>
              {hasRuns ? `${tr(lang, "uc.sj.attestation", "Attestation")} ${a.pass ? tr(lang, "uc.sj.pass", "PASS") : tr(lang, "uc.sj.fail", "FAIL")}` : tr(lang, "uc.sj.noruns", "No runs yet")}
            </span>
            <span className="text-sm text-ink-soft">{hasRuns ? tr(lang, "uc.sj.n_of", "{n} of {t} runs").replace("{n}", String(runs.length)).replace("{t}", String(target)) : tr(lang, "uc.sj.auto_at", "report is filed automatically at {t}").replace("{t}", String(target))}</span>
          </p>
          {hasRuns && !a.pass && (
            <ul className="max-w-[46ch] space-y-1 text-sm text-ember">
              {a.failing.map((f) => <li key={f}><span aria-hidden>✕ </span>{f}</li>)}
            </ul>
          )}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <MetricChart title={tr(lang, "uc.sj.m_acc", "Inference accuracy")} runs={runs} pick={(r) => r.accuracy} threshold={th.accuracy_min} kind="min" mean={a.means.accuracy} label={tr(lang, "uc.sj.mean_min", "mean across runs; at least {p}").replace("{p}", pct(th.accuracy_min))} />
          <MetricChart title={tr(lang, "uc.sj.m_hal", "Hallucination rate")} runs={runs} pick={(r) => r.hallucination_rate} threshold={th.hallucination_max} kind="max" mean={a.means.hallucination_rate} label={tr(lang, "uc.sj.mean_max", "mean across runs; at most {p}").replace("{p}", pct(th.hallucination_max))} />
          <MetricChart title={tr(lang, "uc.sj.m_ali", "Goal alignment")} runs={runs} pick={(r) => r.goal_alignment} threshold={th.goal_alignment_min} kind="min" mean={a.means.goal_alignment} label={tr(lang, "uc.sj.mean_min", "mean across runs; at least {p}").replace("{p}", pct(th.goal_alignment_min))} />
        </div>
        {goals.length > 0 && (
          <div className={`${card} mt-4`}>
            <h3 className="text-sm font-medium">{tr(lang, "uc.sj.goals", "Entity goals behind goal alignment")}</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {goals.map((g) => (
                <li key={g.id}><bdi dir="ltr" className="font-mono text-xs">{g.id}</bdi> {g.text} <span className="text-xs text-ink-soft">({tr(lang, "uc.sj.measured_by", "measured by")} <bdi dir="ltr">{g.criterion}</bdi>)</span></li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-soft"><bdi dir="ltr">{GOAL_ALIGNMENT_FORMULA}</bdi>. {tr(lang, "uc.sj.computed", "Computed from this run's rejects, not randomly.")}</p>
          </div>
        )}
        <p className="mt-3 text-xs text-ink-soft">
          {liveMode
            ? tr(lang, "uc.sj.prov_live", "Provenance: accuracy, hallucination and goal alignment are SIMULATED. Human final approval and AI disclosure rejects are FROM SIJIL (approval rejects inferred from approval records and flagged tool calls; disclosure is measured only if SIJIL_DISCLOSURE_RULE is set).")
            : tr(lang, "uc.sj.prov_sim", "Provenance: every metric is SIMULATED (goal alignment is computed from the entity goals when they are seeded).")}
        </p>
        <div className={`${card} mt-4`}>
          <RunProgress runs={runs} target={target} runOk={runOk} filed={latest ? { pass: latest.pass, runs: latest.runs } : null} />
        </div>
      </Section>

      {canEdit && (
        <Section eyebrow={tr(lang, "uc.sj.cfg", "Configure")} title={liveMode ? tr(lang, "uc.sj.pull", "Pull from Sijil") : tr(lang, "uc.sj.runpilot_t", "Run a pilot")} lede={liveMode ? tr(lang, "uc.sj.cfg_live", "Verifies the node's hash chain, then imports one run per finished task. Nothing is imported or filed if verification fails.") : tr(lang, "uc.sj.cfg_sim", "Pick how the simulated agent behaves, then run it. Results are scored per Prism criterion; at the target run count the report is filed and the result is written to the dashboard.")}>
          <div className={`${card} flex flex-wrap items-end gap-4`}>
            {!liveMode && <><label className="min-w-64 flex-1 text-sm">
              <span className="font-medium">{tr(lang, "uc.sj.behaviour", "Simulated behaviour")}</span>
              <select value={profile} onChange={(e) => setProfile(e.target.value as Profile)} className={field}>
                {Object.entries(PROFILES).map(([k, v]) => <option key={k} value={k}>{tr(lang, `uc.sj.profile.${k}`, v)}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="font-medium">{tr(lang, "uc.sj.runs", "Runs")}</span>
              <select value={count} onChange={(e) => setCount(Number(e.target.value))} className={field}>
                {[5, 10, 30].map((n) => <option key={n}>{n}</option>)}
              </select>
            </label></>}
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => call("POST", { profile, count }, (d) => `${tr(lang, "uc.sj.on_record", "{n} runs on record").replace("{n}", String(d.runs))}${d.live ? ` ${tr(lang, "uc.sj.chain_ok2", "(chain verified)")}` : ""}.${d.filed ? ` ${tr(lang, "uc.sj.filed", "Pilot report filed")}${d.applied ? tr(lang, "uc.sj.applied", "; compliance written to the dashboard") : ""}.` : ""}`)} className={btnPrimary}>{busy ? (liveMode ? tr(lang, "uc.sj.pulling", "Pulling…") : tr(lang, "uc.sj.running", "Running…")) : liveMode ? tr(lang, "uc.sj.pull", "Pull from Sijil") : tr(lang, "uc.sj.runpilot", "Run pilot")}</button>
              <button disabled={busy || !hasRuns} onClick={() => call("PUT", undefined, () => tr(lang, "uc.sj.interim", "Interim report filed."))} className={btnGhost}>{tr(lang, "uc.sj.filenow", "File report now")}</button>
              <button disabled={busy || !hasRuns} onClick={() => call("DELETE", undefined, () => tr(lang, "uc.sj.cleared", "Runs cleared."))} className={btnGhost}>{tr(lang, "uc.sj.reset", "Reset runs")}</button>
            </div>
          </div>
          {msg && <p role="status" className={`mt-3 text-sm ${msg.ok ? "text-lit-deep" : "text-ember"}`}>{msg.ok ? "✓" : "✕"} {msg.text}</p>}
        </Section>
      )}

      <div className="grid gap-x-10 gap-y-12 lg:grid-cols-2">
        <Section eyebrow={tr(lang, "uc.sj.evidence", "Evidence")} title={tr(lang, "uc.sj.rejects_t", "Rejects per criterion")} lede={tr(lang, "uc.sj.rejects_l", "Each agent action that fails a Prism criterion counts as a reject. Hard criteria must be 0.")}>
          <div className={card}><RejectBars rejects={a.rejects} /></div>
        </Section>

        <Section eyebrow={tr(lang, "uc.sj.record", "Record")} title={`${tr(lang, "uc.sj.filed_reports", "Filed pilot reports")} (${reports.length})`}>
          <div className={card}>
            <ul className="space-y-3 text-sm">
              {reports.map((r, i) => (
                <li key={r.id} className="border-t border-line pt-3 first:border-0 first:pt-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${r.pass ? "border-lit/50 text-lit-deep" : "border-ember/60 text-ember"}`}>{r.pass ? `✓ ${tr(lang, "uc.sj.pass", "PASS")}` : `✕ ${tr(lang, "uc.sj.fail", "FAIL")}`}</span>
                      <span><bdi dir="ltr">{new Date(r.created_at).toLocaleString("en-GB", { timeZone: "Asia/Dubai" })}</bdi> · {r.runs} {tr(lang, "uc.sj.runs_lc", "runs")}{i === 0 ? ` · ${tr(lang, "uc.sj.latest", "latest")}` : ""}</span>
                    </span>
                    <button className="font-medium underline underline-offset-2" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? tr(lang, "uc.sj.hide", "Hide") : tr(lang, "uc.sj.view", "View")}</button>
                  </div>
                  <p dir="ltr" className="mt-1 text-start font-mono text-[11px] break-all text-ink-soft">sha256 {r.sha256.slice(0, 16)}…</p>
                  {open === r.id && <pre dir="auto" className="mt-2 max-h-96 overflow-auto rounded-lg border border-line bg-paper p-3 text-xs whitespace-pre-wrap">{r.content}</pre>}
                </li>
              ))}
              {!reports.length && <li className="text-ink-soft">{tr(lang, "uc.sj.none_yet", "None yet. The first report is filed when the run count reaches {t}, or on demand with “File report now”.").replace("{t}", String(target))}</li>}
            </ul>
            {reports.length > 0 && <a href={`/api/admin/un/use-cases/${uc.id}/report`} className="mt-4 inline-block text-sm font-medium underline underline-offset-2">{tr(lang, "uc.sj.download", "Download latest (Markdown)")}</a>}
          </div>
        </Section>
      </div>

      <Section eyebrow={tr(lang, "uc.sj.data", "Data")} title={`${tr(lang, "uc.sj.runs", "Runs")} (${runs.length})`} lede={hasRuns ? tr(lang, "uc.sj.table_l", "Latest first. ✕ marks a value outside its threshold or a hard-criterion reject; this table is the text version of the charts.") : undefined}>
        <details open={!hasRuns}>
          <summary className="cursor-pointer text-sm underline underline-offset-4">{tr(lang, "ucsum.runs.show", "Show the runs table ({n})").replace("{n}", String(runs.length))}</summary>
          <div className="mt-3">
        <div {...scrollRegion("sj-runs-cap")} className="relative max-h-[28rem] overflow-auto rounded-2xl border border-line bg-card">
          <table className="w-full min-w-[40rem] text-sm">
            <caption id="sj-runs-cap" className="sr-only">{tr(lang, "uc.sj.table_cap", "Pilot runs with accuracy, hallucination, alignment and rejects")}</caption>
            <thead className="sticky top-0 bg-card text-start font-mono text-[11px] tracking-wide text-ink-soft uppercase shadow-[0_1px_0_var(--color-line)]">
              <tr>
                <th scope="col" className="px-4 py-3 text-start font-normal">{tr(lang, "uc.sj.col_run", "Run")}</th><th scope="col" className="text-start font-normal">{tr(lang, "uc.sj.col_actions", "Actions")}</th>
                <th scope="col" className="text-start font-normal">{tr(lang, "uc.sj.col_acc", "Accuracy")}</th><th scope="col" className="text-start font-normal">{tr(lang, "uc.sj.col_hal", "Hallucination")}</th>
                <th scope="col" className="text-start font-normal">{tr(lang, "uc.sj.col_ali", "Alignment")}</th><th scope="col" className="pe-4 text-start font-normal">{tr(lang, "uc.sj.col_rej", "Rejects")}</th>
              </tr>
            </thead>
            <tbody>
              {[...runs].reverse().map((r) => (
                <tr key={r.run_no} className="border-t border-line">
                  <th scope="row" className="px-4 py-2 text-start font-mono text-xs font-normal">{r.run_no}</th>
                  <td className="tabular-nums">{r.actions}</td>
                  {flag(accOk(r), pct(r.accuracy))}
                  {flag(halOk(r), pct(r.hallucination_rate))}
                  {flag(aliOk(r), pct(r.goal_alignment))}
                  <td className={`pe-4 tabular-nums ${hardIn(r) ? "font-medium text-ember" : ""}`}>{hardIn(r) ? <span aria-hidden>✕ </span> : null}{rejectsIn(r)}{hardIn(r) ? <span className="sr-only"> {tr(lang, "uc.sj.hard_sr", "(hard criterion breached)")}</span> : null}</td>
                </tr>
              ))}
              {!hasRuns && <tr><td colSpan={6} className="px-4 py-10 text-center text-ink-soft">{tr(lang, "uc.sj.noruns2", "No runs yet.")}{canEdit ? ` ${tr(lang, "uc.sj.use_run", "Use “Run pilot” above.")}` : ""}</td></tr>}
            </tbody>
          </table>
        </div>
          </div>
        </details>
      </Section>
    </div>
  );
}
