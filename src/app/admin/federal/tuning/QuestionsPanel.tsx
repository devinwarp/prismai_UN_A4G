"use client";

import { useState } from "react";
import type { Question, QResult, QVerdict } from "@/lib/un/tuning-bank";
import type { TuningState } from "@/lib/un/tuning-service";
import { btnGhost, btnPrimary, field } from "../_components/ui";
import { useAct, useT } from "./useTuning";

const VERDICT_EN: Record<QVerdict, string> = { correct: "Correct", wrong_citation: "Wrong passage", went_outside: "Went outside", answered_anyway: "Answered, should not have" };
const GOOD = "var(--color-v-auto)";
const BAD = "var(--color-v-nogo)";
const short = (id: string) => id.split("#")[1] ?? id;

export function Verdict({ v }: { v: QVerdict }) {
  const { t } = useT();
  const ok = v === "correct";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 font-mono text-[11px] whitespace-nowrap">
      <span aria-hidden style={{ color: ok ? GOOD : BAD }}>{ok ? "●" : "✕"}</span>
      {t(`tn.vd.${v}`, VERDICT_EN[v])}
    </span>
  );
}

function Trace({ r }: { r: QResult }) {
  const { t, tv } = useT();
  return (
    <ol className="mt-3 space-y-3 text-sm" dir="ltr" aria-label={t("tn.trace", "Thought, action, observation trace")}>
      {r.steps.map((s, i) => (
        <li key={i} className="rounded-xl border border-line p-3">
          <p className="font-mono text-[11px] tracking-wide text-ink-soft uppercase">{tv("tn.step", "Step {n}", { n: i + 1 })}</p>
          <dl className="mt-1 grid gap-1 sm:grid-cols-[6rem_1fr]">
            <dt className="text-ink-soft">{t("tn.thought", "Thought")}</dt><dd>{s.thought}</dd>
            <dt className="text-ink-soft">{t("tn.action", "Action")}</dt>
            <dd className="font-mono text-xs break-words">
              {s.action.tool === "search_sop" ? `search_sop(“${s.action.query}”${s.action.kind ? `, kind=${s.action.kind}` : ""})` : s.action.tool === "finish" ? `finish(${s.action.citations.map(short).join(", ")})` : `request_outside_information(“${s.action.question}”)`}
            </dd>
            <dt className="text-ink-soft">{t("tn.observation", "Observation")}</dt><dd className="font-mono text-xs break-words">{s.observation}</dd>
          </dl>
        </li>
      ))}
    </ol>
  );
}

function expectText(q: { expect: Question["expect"] }, t: (k: string, en: string) => string) {
  return "outside" in q.expect ? t("tn.expect.outside", "Should go outside the SOP") : q.expect.chunks.map(short).join(", ");
}

function AddForm({ state, canEdit }: { state: TuningState; canEdit: boolean }) {
  const { t } = useT();
  const { busy, error, act } = useAct();
  const [text, setText] = useState("");
  const [chunks, setChunks] = useState("");
  const [outside, setOutside] = useState(false);
  const [split, setSplit] = useState<"tune" | "holdout">("tune");
  const nextId = `q${String(Math.max(0, ...state.questions.map((q) => Number(q.id.slice(1)) || 0)) + 1).padStart(2, "0")}`;
  const submit = async () => {
    const ids = chunks.split(/[\s,]+/).filter(Boolean).map((c) => (c.includes("#") ? c : `${state.chunkIds[0].split("#")[0]}#${c}`));
    const d = await act("bank", { op: "bank", action: "add", question: { id: nextId, question: text, split, expect: outside ? { outside: true } : { chunks: ids } } });
    if (d) { setText(""); setChunks(""); setOutside(false); }
  };
  return (
    <details className="mt-6">
      <summary className="cursor-pointer text-sm font-medium">{t("tn.q.add", "Add a question")}</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">{t("tn.q.text", "Question")}
          <input className={field} value={text} onChange={(e) => setText(e.target.value)} disabled={!canEdit} maxLength={300} />
        </label>
        <label className="text-sm">{t("tn.q.chunks", "Expected passage ids (for example D4, Q1)")}
          <input className={field} dir="ltr" value={chunks} onChange={(e) => setChunks(e.target.value)} disabled={!canEdit || outside} />
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={outside} onChange={(e) => setOutside(e.target.checked)} disabled={!canEdit} />{t("tn.q.outside", "The SOP does not answer this: it should go outside")}</label>
        <label className="text-sm">{t("tn.q.split", "Used for")}
          <select className={field} value={split} onChange={(e) => setSplit(e.target.value as "tune" | "holdout")} disabled={!canEdit}>
            <option value="tune">{t("tn.split.tune", "Tuning")}</option>
            <option value="holdout">{t("tn.split.holdout", "Held out")}</option>
          </select>
        </label>
        <div className="self-end"><button type="button" className={btnPrimary} disabled={!canEdit || !!busy || text.trim().length < 5} onClick={submit}>{t("tn.q.save", "Add to the bank")}</button></div>
      </div>
      {error && <p role="alert" className="mt-2 text-sm" style={{ color: BAD }}>{error}</p>}
    </details>
  );
}

export default function QuestionsPanel({ state, canEdit }: { state: TuningState; canEdit: boolean }) {
  const { t, tv } = useT();
  const { busy, error, note, setNote, act } = useAct();
  const run = state.lastQuestions;
  const byId = new Map((run?.results ?? []).map((r) => [r.id, r]));
  const tuneN = state.questions.filter((q) => q.split === "tune").length;
  const stale = run && run.results.length !== state.questions.length;
  const fix = async (id: string) => {
    const d = await act(`fix-${id}`, { op: "fix", question_id: id });
    if (d) setNote(d.id ? tv("tn.fix.done", "Proposed: {s}. It is under Versions for a person to approve.", { s: String(d.summary) }) : t("tn.fix.none", "No verified fix found: nothing the proposer tried fixed this question without breaking another tuning question. Edit the glossary or settings by hand."));
  };
  return (
    <section id="questions" aria-labelledby="h-questions" className="mt-10">
      <h2 id="h-questions" className="font-display text-2xl font-medium">{t("tn.q.title", "Questions")}</h2>
      <p className="mt-2 max-w-[68ch] text-sm text-ink-soft">{tv("tn.q.lede", "Each question names the passage that answers it, or says the SOP does not and it should go outside. {t} are for tuning; {h} are held out: the proposer never reads them, so they show whether a change generalises.", { t: tuneN, h: state.questions.length - tuneN })}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className={btnPrimary} disabled={!canEdit || !!busy} onClick={() => act("run", { op: "run_questions" })}>{busy === "run" ? t("tn.running", "Running…") : t("tn.q.run", "Run all questions")}</button>
        {run && <p className="text-xs text-ink-soft">{tv("tn.q.last", "Last run under settings v{v} by {a}", { v: run.config_version, a: run.actor })}{stale ? ` · ${t("tn.q.stale", "the bank has changed since: run again")}` : ""}</p>}
      </div>
      {error && <p role="alert" className="mt-2 text-sm" style={{ color: BAD }}>{error}</p>}
      {note && <p role="status" className="mt-2 text-sm">{note}</p>}
      {!run && <p className="mt-4 text-sm text-ink-soft">{t("tn.q.none", "No run yet. Run all questions to see each answer and its trace.")}</p>}
      <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-card">
        {state.questions.map((q) => {
          const r = byId.get(q.id);
          const miss = r && r.verdict !== "correct";
          return (
            <li key={q.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] tracking-wide text-ink-soft uppercase">{q.id} · {q.split === "tune" ? t("tn.split.tune", "Tuning") : t("tn.split.holdout", "Held out")}</p>
                  <p className="mt-1 text-sm font-medium">{q.question}</p>
                  <p className="mt-1 text-xs text-ink-soft">{t("tn.q.expects", "Expected")}: <span dir="ltr">{expectText(q, t)}</span>{r && r.citations.length > 0 && <> · {t("tn.q.got", "Cited")}: <span dir="ltr">{r.citations.map(short).join(", ")}</span></>}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {r ? <Verdict v={r.verdict} /> : <span className="text-xs text-ink-soft">{t("tn.q.notrun", "not run")}</span>}
                  {miss && q.split === "tune" && <button type="button" className={btnGhost} disabled={!canEdit || !!busy} onClick={() => fix(q.id)}>{busy === `fix-${q.id}` ? t("tn.running", "Running…") : t("tn.fix", "Propose a fix")}</button>}
                  {miss && q.split === "holdout" && <span className="text-xs text-ink-soft">{t("tn.q.sealed", "held out: the proposer never reads this")}</span>}
                </div>
              </div>
              {r && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-ink-soft">{tv("tn.q.trace", "Trace ({n} steps)", { n: r.steps.length })}</summary>
                  <Trace r={r} />
                </details>
              )}
              {canEdit && <button type="button" className="mt-2 text-xs text-ink-soft underline" disabled={!!busy} onClick={() => act("del", { op: "bank", action: "delete", id: q.id })}>{t("tn.q.delete", "Remove from the bank")}</button>}
            </li>
          );
        })}
      </ul>
      <AddForm state={state} canEdit={canEdit} />
    </section>
  );
}
