"use client";

import { useState } from "react";
import type { TuningState } from "@/lib/un/tuning-service";
import type { Scores, SijilScore, Version } from "@/lib/un/tuning-versions";
import { btnGhost, btnPrimary, field } from "../_components/ui";
import { useAct, useT } from "./useTuning";

const KIND_EN: Record<string, string> = { proposed: "Proposed", approved: "Approved", rejected: "Rejected", bank_edit: "Question bank edited" };
const STATUS_EN: Record<Version["status"], string> = { proposed: "Waiting for a person", approved: "Approved, in use unless a later one is", rejected: "Rejected" };
const DUBAI = { timeZone: "Asia/Dubai" } as const;

function Pair({ label, a, b }: { label: string; a: { n: number; correct: number; unsafe: number }; b: { n: number; correct: number; unsafe: number } }) {
  const { tv } = useT();
  const same = a.correct === b.correct;
  return (
    <div className="text-sm">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="tabular-nums">
        {tv("tn.v.pair", "{a} to {b} of {n} correct", { a: a.correct, b: b.correct, n: b.n })}
        {!same && <span aria-hidden> {b.correct > a.correct ? "▲" : "▼"}</span>}
        {b.unsafe > 0 && <span className="text-xs" style={{ color: "var(--color-v-nogo)" }}> · {tv("tn.v.unsafe", "{u} unsafe", { u: b.unsafe })}</span>}
      </dd>
    </div>
  );
}

function ScoreGrid({ before, after }: { before: Scores; after: Scores }) {
  const { t } = useT();
  return (
    <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Pair label={t("tn.v.qtune", "Questions, tuning")} a={before.questions.tune} b={after.questions.tune} />
      <Pair label={t("tn.v.qhold", "Questions, held out")} a={before.questions.holdout} b={after.questions.holdout} />
      <Pair label={t("tn.v.ttune", "Task evals, tuning")} a={before.tasks.tune} b={after.tasks.tune} />
      <Pair label={t("tn.v.thold", "Task evals, held out")} a={before.tasks.holdout} b={after.tasks.holdout} />
    </dl>
  );
}

function SijilNote({ before, after }: { before?: SijilScore; after?: SijilScore }) {
  const { t, tv } = useT();
  const s = after ?? before;
  if (!s) return null;
  const rules = Object.keys(s.by_rule).length ? ` · ${Object.keys(s.by_rule).join(", ")}` : "";
  return (
    <p className="mt-2 text-xs text-ink-soft">
      {tv("tn.v.sijil", "Sijil screening: {b} block(s) before, {a} after ({at} attacks stopped, {al} alignment) — inference {ok}{rules}", {
        b: before?.blocks ?? 0, a: after?.blocks ?? 0,
        at: after?.attacks_stopped ?? before?.attacks_stopped ?? 0, al: after?.alignment ?? before?.alignment ?? 0,
        ok: s.allowed ? t("tn.v.allowed", "allowed") : t("tn.v.blocked", "blocked"), rules,
      })}
    </p>
  );
}

function Decide({ v, canEdit }: { v: Version; canEdit: boolean }) {
  const { t } = useT();
  const { busy, error, act } = useAct();
  const [comment, setComment] = useState("");
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-end gap-3">
        <button type="button" className={btnPrimary} disabled={!canEdit || !!busy} onClick={() => act("approve", { op: "decide", id: v.id, decision: "approve", comment })}>{t("tn.v.approve", "Approve this version")}</button>
        <label className="min-w-[14rem] flex-1 text-xs text-ink-soft">{t("tn.v.comment", "Comment (needed to reject)")}
          <input className={field} value={comment} onChange={(e) => setComment(e.target.value)} disabled={!canEdit} maxLength={1000} />
        </label>
        <button type="button" className={btnGhost} disabled={!canEdit || !!busy || !comment.trim()} onClick={() => act("reject", { op: "decide", id: v.id, decision: "reject", comment })}>{t("tn.v.reject", "Reject")}</button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--color-v-nogo)" }}>{error}</p>}
    </div>
  );
}

export default function VersionsPanel({ state, canEdit }: { state: TuningState; canEdit: boolean }) {
  const { t, tv } = useT();
  const versions = [...state.versions].sort((a, b) => b.proposed_at.localeCompare(a.proposed_at));
  return (
    <section id="versions" aria-labelledby="h-versions">
      <h2 id="h-versions" className="font-display text-2xl font-medium">{t("tn.v.title", "Versions and approval")}</h2>
      <p className="mt-2 max-w-[68ch] text-sm text-ink-soft">{t("tn.v.lede", "Every change is a version. A person approves the version the agent uses. Code refuses an approval of a value outside the safe ranges, of a stale version, and of a version that makes the agent answer what the SOP does not answer.")}</p>
      {!versions.length && <p className="mt-4 text-sm text-ink-soft">{t("tn.v.none", "No versions yet. The agent uses the built-in defaults (v0).")}</p>}
      {(() => {
        // the iteration at which each target's prompt version was agreed: the first approved version whose
        // screening recorded no alignment block (inference allowed). Only shown when screening recorded blocks.
        const screened = versions.some((v) => v.before.sijil || v.after.sijil);
        if (!screened) return null;
        const agreed = [...new Set(versions.map((v) => v.target))].map((target) => {
          const vs = versions.filter((v) => v.target === target && v.status === "approved" && v.after.sijil?.allowed).sort((a, b) => a.version - b.version);
          return vs.length ? `${target} v${vs[0].version}` : null;
        }).filter(Boolean);
        return agreed.length ? <p className="mt-3 text-sm text-ink-soft">{tv("tn.v.agreed", "First approved version per target with inference allowed (no alignment blocks): {list}", { list: agreed.join(", ") })}</p> : null;
      })()}
      <ul className="mt-4 space-y-3">
        {versions.map((v) => (
          <li key={v.id} className="rounded-2xl border border-line bg-card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-mono text-xs tracking-wide text-ink-soft uppercase" dir="ltr">{v.id}</p>
              <p className="text-xs font-medium">{t(`tn.vs.${v.status}`, STATUS_EN[v.status])}</p>
            </div>
            <p className="mt-1 text-sm font-medium">{v.summary}</p>
            <p className="mt-1 text-xs text-ink-soft">{tv("tn.v.by", "Proposed by {p}", { p: v.proposed_by })}{v.decided_by ? ` · ${tv("tn.v.decided", "decided by {d}", { d: v.decided_by })}` : ""}{v.comment ? ` · “${v.comment}”` : ""}</p>
            <ScoreGrid before={v.before} after={v.after} />
            <SijilNote before={v.before.sijil} after={v.after.sijil} />
            {v.after.tasks.error && <p className="mt-2 text-xs" style={{ color: "var(--color-v-nogo)" }}>{tv("tn.t.error", "The agent could not open under these settings: {e}", { e: v.after.tasks.error })}</p>}
            {v.status === "proposed" && <Decide v={v} canEdit={canEdit} />}
          </li>
        ))}
      </ul>

      <h3 className="mt-8 text-base font-medium">{t("tn.l.title", "Hash-chained log")}</h3>
      <p className="mt-1 text-sm" role="status">{state.chain.ok ? tv("tn.l.ok", "Chain verified: {n} entries, each hash covers the one before.", { n: state.log.length }) : tv("tn.l.broken", "The log failed verification at entry {s}: {r}. Nothing can be approved until it is looked at.", { s: state.chain.broken_seq, r: state.chain.reason })}</p>
      <ol className="mt-3 space-y-1 text-sm">
        {[...state.log].reverse().map((e) => (
          <li key={e.seq} className="flex flex-wrap items-baseline gap-x-3 text-xs">
            <span className="font-mono">#{e.seq}</span>
            <span className="font-medium">{t(`tn.lk.${e.kind}`, KIND_EN[e.kind])}</span>
            <span dir="ltr">{typeof e.payload.id === "string" ? e.payload.id : typeof e.payload.change === "string" ? `${e.payload.change}: ${(e.payload.ids as string[]).join(", ")}` : ""}</span>
            <span className="text-ink-soft">{e.actor} · {new Date(e.at).toLocaleString("en-GB", DUBAI)}</span>
            <code className="text-ink-soft" dir="ltr">{e.hash.slice(0, 12)}…</code>
          </li>
        ))}
      </ol>
    </section>
  );
}
