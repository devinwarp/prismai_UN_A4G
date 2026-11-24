"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { CHECK_CRITERIA, CHECK_SCOPES, COMPARATORS, describeTarget, MEASURED_BY, PARAM_KEYS, UNITS, type Target, type TargetState } from "@/lib/un/targets";
import type { EntityGoal } from "@/lib/un/goals";
import { useLang } from "../../../_components/Lang";
import { btnGhost, btnPrimary, card, field } from "../../../_components/ui";
import { ApproveBox, ChainNote } from "../tests/TestSetEditor";

type Approver = { title: string; source: string };
interface Draft { id: string; kind: string; goal_id: string; statement: string; comparator: string; value: string; unit: string; measured_by: string; evidence: string; param_key: string; check_on: boolean; check_scope: string; check_criterion: string }

const blank = (n: number, goal: string): Draft => ({ id: `T${n}`, kind: "outcome", goal_id: goal, statement: "", comparator: "min", value: "", unit: "percent", measured_by: "pilot", evidence: "", param_key: "", check_on: false, check_scope: "all", check_criterion: "accuracy" });
const toDraft = (t: Target): Draft => ({ id: t.id, kind: t.kind ?? "outcome", goal_id: t.goal_id ?? "", statement: t.statement, comparator: t.comparator, value: String(t.value), unit: t.unit, measured_by: t.measured_by, evidence: t.evidence, param_key: t.param_key ?? "", check_on: !!t.check, check_scope: t.check?.scope ?? "all", check_criterion: t.check?.criterion ?? "accuracy" });

/** The targets of one use case: what it commits to deliver towards the goals of its entity. The goals are read-only here;
 * the process owner proposes the targets and a person approves them. */
export function TargetsEditor({ useCaseId, entity, goals, goalsSource, state, chain, approvers, mayEdit, mayApprove, userId, storeError }: {
  useCaseId: string; entity: string; goals: EntityGoal[]; goalsSource: string; state: TargetState; chain: { ok: boolean }; approvers: Approver[]; mayEdit: boolean; mayApprove: boolean; userId: string; storeError: string | null;
}) {
  const lang = useLang();
  const router = useRouter();
  const start = state.pending?.targets ?? state.approved?.targets ?? [];
  const [rows, setRows] = useState<Draft[]>(() => (start.length ? start.map(toDraft) : [blank(1, goals[0]?.id ?? "")]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (i: number, patch: Partial<Draft>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const send = async (body: object) => {
    setBusy(true); setError(null);
    const res = await fetch(`/api/admin/un/use-cases/${useCaseId}/targets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) { setError(d.error ?? tr(lang, "tg2.failed", "The request failed.")); return; }
    router.refresh();
  };
  const targets = () => rows.map((r) => ({ id: r.id.trim(), kind: r.kind, ...(r.kind === "outcome" ? { goal_id: r.goal_id } : {}), statement: r.statement, comparator: r.comparator, value: r.value.trim() === "" ? NaN : Number(r.value), unit: r.unit, measured_by: r.measured_by, evidence: r.evidence, ...(r.param_key ? { param_key: r.param_key } : {}), ...(r.check_on && r.measured_by === "pilot" ? { check: { criterion: r.check_criterion, scope: r.check_scope } } : {}) }));
  const goalText = (id: string) => goals.find((g) => g.id === id)?.text ?? id;
  const nextKind = (i: number, kind: string) => set(i, { kind, goal_id: kind === "outcome" ? (rows[i].goal_id || goals[0]?.id || "") : "" });

  return (
    <>
      <section className={`${card} mt-6`} aria-labelledby="tg2-goals">
        <h2 id="tg2-goals" className="font-display text-xl font-medium">{tr(lang, "tg2.goals", "Goals of")} {entity}</h2>
        <p className="mt-1 text-sm text-ink-soft">{tr(lang, "tg2.goals.lede", "What the entity wants to achieve. Read only here: each target below contributes to one of them.")} <span className="font-mono text-xs">({goalsSource})</span></p>
        {goals.length === 0 ? <p className="mt-2 text-sm font-medium">{tr(lang, "tg2.nogoals", "This entity has no goals on record, so no target can be linked.")}</p> : (
          <ul className="mt-3 space-y-1 text-sm">{goals.map((g) => <li key={g.id}><span className="font-mono text-xs">{g.id}</span> · {g.text} <span className="text-xs text-ink-soft">({g.criterion})</span></li>)}</ul>
        )}
      </section>

      <section className={`${card} mt-6`} aria-labelledby="tg2-h">
        <h2 id="tg2-h" className="font-display text-xl font-medium">{tr(lang, "tg2.h", "Process targets")}</h2>
        <p className="mt-1 max-w-[68ch] text-sm text-ink-soft">{tr(lang, "tg2.lede", "What this use case commits to deliver towards those goals, as a number with a unit and a way of measuring it. A target measured only after go-live is marked so: the pilot cannot prove it.")}</p>
        <ChainNote chain={chain} />
        {storeError && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--color-v-nogo)" }}>{storeError}</p>}
        <p className="mt-2 text-sm" role="status">
          {state.approved ? <span>{tr(lang, "pm.approved", "Approved")} v{state.approved.version} · <span className="font-mono text-xs">{state.approved.hash.slice(0, 12)}</span> · {state.approved.approver}</span> : tr(lang, "tg2.none", "Nothing approved yet.")}
          {state.pending && <span className="ms-2">{tr(lang, "pm.pending", "A proposal is waiting for approval.")}</span>}
        </p>

        {state.approved && (
          <ul className="mt-3 space-y-1 text-sm">
            {state.approved.targets.map((t) => <li key={t.id}><span className="font-mono text-xs">{t.id}</span> · {t.statement}: <strong>{describeTarget(t)}</strong> <span className="text-xs text-ink-soft">→ {t.kind === "control" ? tr(lang, "tg2.kind.control.short", "control, no goal") : t.goal_id} · {t.measured_by === "pilot" ? tr(lang, "tg2.by.pilot", "measured in the pilot") : tr(lang, "tg2.by.live", "measured after go-live")} · {t.evidence}{t.check ? ` · ${tr(lang, "tg2.checked", "checked on tests")}: ${t.check.scope === "all" ? tr(lang, "tg2.scope.all", "every test") : tr(lang, "tg2.scope.cf", "client-facing tests only")}` : ""}</span></li>)}
          </ul>
        )}

        {mayEdit && !storeError && (
          <div className="mt-5">
            <h3 className="text-base font-medium">{tr(lang, "tg2.edit", "Propose targets")}</h3>
            <div className="mt-2 space-y-3">
              {rows.map((r, i) => (
                <div key={i} className="rounded-xl border border-line p-3">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div><label className="block text-sm" htmlFor={`t-id-${i}`}>{tr(lang, "tg2.id", "Id")}</label><input id={`t-id-${i}`} className={field} value={r.id} onChange={(e) => set(i, { id: e.target.value })} maxLength={40} /></div>
                    <div><label className="block text-sm" htmlFor={`t-kind-${i}`}>{tr(lang, "tg2.kind", "Kind")}</label>
                      <select id={`t-kind-${i}`} className={field} value={r.kind} onChange={(e) => nextKind(i, e.target.value)}><option value="outcome">{tr(lang, "tg2.kind.outcome", "outcome: contributes to a goal")}</option><option value="control">{tr(lang, "tg2.kind.control", "control: a compliance rule, no goal")}</option></select></div>
                    {r.kind === "outcome" && <div className="sm:col-span-3"><label className="block text-sm" htmlFor={`t-goal-${i}`}>{tr(lang, "tg2.goal", "Contributes to goal")}</label>
                      <select id={`t-goal-${i}`} className={field} value={r.goal_id} onChange={(e) => set(i, { goal_id: e.target.value })}>{goals.map((g) => <option key={g.id} value={g.id}>{g.id}: {g.text}</option>)}</select></div>}
                  </div>
                  <label className="mt-3 block text-sm" htmlFor={`t-st-${i}`}>{tr(lang, "tg2.statement", "What is committed")}</label>
                  <input id={`t-st-${i}`} className={field} value={r.statement} onChange={(e) => set(i, { statement: e.target.value })} maxLength={300} />
                  <div className="mt-3 grid gap-3 sm:grid-cols-4">
                    <div><label className="block text-sm" htmlFor={`t-cmp-${i}`}>{tr(lang, "tg2.cmp", "At")}</label><select id={`t-cmp-${i}`} className={field} value={r.comparator} onChange={(e) => set(i, { comparator: e.target.value })}>{COMPARATORS.map((c) => <option key={c} value={c}>{c === "min" ? tr(lang, "tg2.min", "least") : tr(lang, "tg2.max", "most")}</option>)}</select></div>
                    <div><label className="block text-sm" htmlFor={`t-val-${i}`}>{tr(lang, "tg2.value", "Value")}</label><input id={`t-val-${i}`} inputMode="decimal" className={field} value={r.value} onChange={(e) => set(i, { value: e.target.value })} /></div>
                    <div><label className="block text-sm" htmlFor={`t-unit-${i}`}>{tr(lang, "tg2.unit", "Unit")}</label><select id={`t-unit-${i}`} className={field} value={r.unit} onChange={(e) => set(i, { unit: e.target.value })}>{UNITS.map((u) => <option key={u} value={u}>{u.replace("_", " ")}</option>)}</select></div>
                    <div><label className="block text-sm" htmlFor={`t-by-${i}`}>{tr(lang, "tg2.by", "Measured")}</label><select id={`t-by-${i}`} className={field} value={r.measured_by} onChange={(e) => set(i, { measured_by: e.target.value })}>{MEASURED_BY.map((m) => <option key={m} value={m}>{m === "pilot" ? tr(lang, "tg2.by.pilot", "measured in the pilot") : tr(lang, "tg2.by.live", "measured after go-live")}</option>)}</select></div>
                  </div>
                  <label className="mt-3 block text-sm" htmlFor={`t-ev-${i}`}>{tr(lang, "tg2.evidence", "How it is measured")}</label>
                  <input id={`t-ev-${i}`} className={field} value={r.evidence} onChange={(e) => set(i, { evidence: e.target.value })} maxLength={300} />
                  {r.measured_by === "pilot" && (
                    <>
                      <label className="mt-3 block text-sm" htmlFor={`t-pk-${i}`}>{tr(lang, "tg2.param", "Verdict parameter it feeds (optional)")}</label>
                      <select id={`t-pk-${i}`} className={field} value={r.param_key} onChange={(e) => set(i, { param_key: e.target.value })}><option value="">{tr(lang, "tg2.noparam", "none")}</option>{PARAM_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}</select>
                    </>
                  )}
                  {r.measured_by === "pilot" && (
                    <div className="mt-3">
                      <label className="flex items-center gap-2 text-sm" htmlFor={`t-ck-${i}`}><input id={`t-ck-${i}`} type="checkbox" checked={r.check_on} onChange={(e) => set(i, { check_on: e.target.checked })} />{tr(lang, "tg2.check", "Also judge this on each pilot test (a zero-tolerance acceptance check)")}</label>
                      {r.check_on && (
                        <div className="mt-2 grid gap-3 sm:grid-cols-2">
                          <div><label className="block text-sm" htmlFor={`t-cs-${i}`}>{tr(lang, "tg2.check.scope", "Asked of")}</label><select id={`t-cs-${i}`} className={field} value={r.check_scope} onChange={(e) => set(i, { check_scope: e.target.value })}>{CHECK_SCOPES.map((c) => <option key={c} value={c}>{c === "all" ? tr(lang, "tg2.scope.all", "every test") : tr(lang, "tg2.scope.cf", "client-facing tests only")}</option>)}</select></div>
                          <div><label className="block text-sm" htmlFor={`t-cc-${i}`}>{tr(lang, "tg2.check.crit", "Criterion")}</label><select id={`t-cc-${i}`} className={field} value={r.check_criterion} onChange={(e) => set(i, { check_criterion: e.target.value })}>{CHECK_CRITERIA.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
                        </div>
                      )}
                    </div>
                  )}
                  {r.kind === "outcome" && <p className="mt-2 text-xs text-ink-soft">{goalText(r.goal_id)}</p>}
                  {rows.length > 1 && <button type="button" className={`${btnGhost} mt-2`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>{tr(lang, "tg2.remove", "Remove this target")}</button>}
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={btnGhost} disabled={rows.length >= 30} onClick={() => setRows([...rows, blank(rows.length + 1, goals[0]?.id ?? "")])}>{tr(lang, "tg2.add", "Add a target")}</button>
              <button type="button" className={btnPrimary} disabled={busy || !chain.ok} onClick={() => send({ action: "propose", targets: targets() })}>{tr(lang, "tg2.propose", "Propose these targets")}</button>
            </div>
          </div>
        )}
        {!mayEdit && <p className="mt-3 text-sm font-medium">{tr(lang, "tg2.readonly", "Read only. Proposing targets needs the scenario edit permission.")}</p>}

        {mayApprove && state.pending && (
          <div className="mt-4 rounded-xl border border-line p-4">
            <h3 className="text-base font-medium">{tr(lang, "ts.approve.h", "Approval")}</h3>
            <ApproveBox idp="tg2" approvers={approvers} selfAuthor={state.pending.by === userId} disabledReason={chain.ok ? null : tr(lang, "ts.chain.bad", "The log chain is broken; changes are refused until it is repaired.")} busy={busy} onApprove={(a) => send({ action: "approve", ...a })} />
          </div>
        )}
        {mayApprove && state.approved && (
          <button type="button" className={`${btnGhost} mt-3`} disabled={busy} onClick={() => send({ action: "withdraw", reason: "withdrawn from the screen" })}>{tr(lang, "tg2.withdraw", "Withdraw the approval in force")}</button>
        )}
        {error && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--color-v-nogo)" }}>{error}</p>}
      </section>
    </>
  );
}
