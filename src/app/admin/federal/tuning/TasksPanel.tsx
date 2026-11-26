"use client";

import type { TuningState } from "@/lib/un/tuning-service";
import { btnPrimary } from "../_components/ui";
import { useAct, useT } from "./useTuning";

export default function TasksPanel({ state, canEdit }: { state: TuningState; canEdit: boolean }) {
  const { t, tv } = useT();
  const { busy, error, act } = useAct();
  const run = state.lastTasks;
  const tasks = run ? [...new Set(run.rows.map((r) => r.task))] : [];
  const bad = run?.rows.filter((r) => r.verdict !== "correct") ?? [];
  return (
    <section id="tasks" aria-labelledby="h-tasks">
      <h2 id="h-tasks" className="font-display text-2xl font-medium">{t("tn.t.title", "Per-task evals")}</h2>
      <p className="mt-2 max-w-[68ch] text-sm text-ink-soft">{t("tn.t.lede", "These run the real licence-renewal agent (the same code the pilot uses): its skill, ReAct retrieval, OCR of synthetic documents and case memory. They are the score a rule-line version or a settings version is judged on, besides the questions above.")}</p>
      <p className="mt-2 max-w-[68ch] text-xs text-ink-soft">{t("tn.t.sim", "What is simulated: the documents, the licence register, the finance system and the applicants are synthetic; OCR output is a recording of Tesseract on the synthetic images; retrieval here is keyword search (BM25), not vectors.")}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className={btnPrimary} disabled={!canEdit || !!busy} onClick={() => act("run", { op: "run_tasks" })}>{busy === "run" ? t("tn.running", "Running…") : t("tn.t.run", "Run the per-task evals")}</button>
        {run && <p className="text-xs text-ink-soft">{tv("tn.q.last", "Last run under settings v{v} by {a}", { v: run.config_version, a: run.actor })}</p>}
      </div>
      {error && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--color-v-nogo)" }}>{error}</p>}
      {!run && <p className="mt-4 text-sm text-ink-soft">{t("tn.t.none", "No run yet.")}</p>}
      {run?.error && <p role="alert" className="mt-4 text-sm" style={{ color: "var(--color-v-nogo)" }}>{tv("tn.t.error", "The agent could not open under these settings: {e}", { e: run.error })}</p>}
      {run && !run.error && (
        <>
          <ul className="mt-4 flex flex-wrap gap-2" aria-label={t("tn.t.by", "Correct cases per task")}>
            {tasks.map((k) => {
              const xs = run.rows.filter((r) => r.task === k);
              const ok = xs.filter((r) => r.verdict === "correct").length;
              return <li key={k} className="rounded-full border border-line px-3 py-1 font-mono text-xs"><span aria-hidden style={{ color: ok === xs.length ? "var(--color-v-auto)" : "var(--color-v-nogo)" }}>{ok === xs.length ? "●" : "✕"}</span> {k} {ok}/{xs.length}</li>;
            })}
          </ul>
          <p className="mt-3 text-sm">{tv("tn.t.total", "{k} of {n} cases correct: {a} of {b} tuning, {c} of {d} held out.", { k: run.rows.length - bad.length, n: run.rows.length, a: run.rows.filter((r) => r.split === "tune" && r.verdict === "correct").length, b: run.rows.filter((r) => r.split === "tune").length, c: run.rows.filter((r) => r.split === "holdout" && r.verdict === "correct").length, d: run.rows.filter((r) => r.split === "holdout").length })}</p>
          {bad.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {bad.map((r) => <li key={r.id}><span className="font-mono text-xs">{r.id}</span> {r.title}: {r.verdict}. {r.failures.join("; ")}</li>)}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
