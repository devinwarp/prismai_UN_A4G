"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import type { Gap } from "@/lib/un/test-derive";
import { FAMILIES, SCENARIOS } from "@/lib/un/test-derive";
import type { TestSetState } from "@/lib/un/test-sets";
import type { Params, ParamState } from "@/lib/un/verdict-params";
import { useLang } from "../../../_components/Lang";
import { btnGhost, btnPrimary, card, field } from "../../../_components/ui";

type Approver = { title: string; source: string };
type Chain = { ok: boolean; broken_seq?: number; reason?: string };
type Review = { gaps: Gap[]; covered: number; total: number; approvable: boolean; inForce: boolean };

function useCall(path: string, profile: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (body: object): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile, ...body }) });
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "The request failed."); return false; }
    router.refresh();
    return true;
  };
  return { busy, error, send };
}

const Err = ({ msg }: { msg: string | null }) => (msg ? <p role="alert" className="mt-2 text-sm" style={{ color: "var(--color-v-nogo)" }}>{msg}</p> : null);

export function ChainNote({ chain }: { chain: Chain }) {
  const lang = useLang();
  return <p className="text-xs text-ink-soft">{chain.ok ? tr(lang, "ts.chain.ok", "Log chain verified.") : tr(lang, "ts.chain.bad", "The log chain is broken; changes are refused until it is repaired.")}</p>;
}

/** The approval box shared by the test set and the parameters. */
export function ApproveBox({ idp, approvers, selfAuthor, disabledReason, busy, onApprove }: { idp: string; approvers: Approver[]; selfAuthor: boolean; disabledReason: string | null; busy: boolean; onApprove: (a: { approver: string; self_approval_reason?: string }) => void }) {
  const lang = useLang();
  const [approver, setApprover] = useState(approvers[0]?.title ?? "");
  const [why, setWhy] = useState("");
  const needWhy = selfAuthor && !why.trim();
  return (
    <div className="mt-4">
      <label className="block text-sm font-medium" htmlFor={`${idp}-sel`}>{tr(lang, "ts.approver", "Approver (from the list for this use case)")}</label>
      <select id={`${idp}-sel`} className={field} value={approver} onChange={(e) => setApprover(e.target.value)}>
        {approvers.map((a) => <option key={a.title} value={a.title}>{a.title}</option>)}
      </select>
      {selfAuthor && (
        <>
          <label className="mt-3 block text-sm font-medium" htmlFor={`${idp}-why`}>{tr(lang, "ts.selfwhy", "You also changed this. State why you approve it yourself (it is logged).")}</label>
          <textarea id={`${idp}-why`} className={field} rows={2} value={why} onChange={(e) => setWhy(e.target.value)} maxLength={500} />
        </>
      )}
      <button type="button" className={`${btnPrimary} mt-3`} disabled={busy || !!disabledReason || needWhy || !approver} onClick={() => onApprove({ approver, self_approval_reason: why.trim() || undefined })}>{tr(lang, "ts.approve", "Approve and lock")}</button>
      {disabledReason && <p className="mt-2 text-sm text-ink-soft">{disabledReason}</p>}
    </div>
  );
}

export function TestSetEditor({ useCaseId, profile, state, review, chain, tasks, approvers, mayEdit, mayApprove, userId }: {
  useCaseId: string; profile: string; state: TestSetState; review: Review; chain: Chain;
  tasks: { id: string; title: string; client_facing: boolean }[]; approvers: Approver[]; mayEdit: boolean; mayApprove: boolean; userId: string;
}) {
  const lang = useLang();
  const { busy, error, send } = useCall(`/api/admin/un/use-cases/${useCaseId}/tests`, profile);
  const [title, setTitle] = useState("");
  const [family, setFamily] = useState<string>("happy_path");
  const [task, setTask] = useState("");
  const [scenario, setScenario] = useState("");
  const [expect, setExpect] = useState("");
  const [retiring, setRetiring] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [waiver, setWaiver] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [local, setLocal] = useState<string | null>(null);

  const active = state.blueprints.filter((b) => b.status === "active");
  const retired = state.blueprints.filter((b) => b.status === "retired");
  const selfAuthor = state.authors.includes(userId);
  const approveBlock = !chain.ok ? tr(lang, "ts.chain.bad", "The log chain is broken; changes are refused until it is repaired.")
    : !review.approvable ? tr(lang, "ts.cannotapprove", "Approval is blocked until every gap above is closed.") : !state.draft && state.approved ? tr(lang, "ts.nochange", "Nothing has changed since the last approval.") : null;

  const add = async () => {
    if (!title.trim() || !expect.trim()) { setLocal(tr(lang, "ts.need", "A test needs a title and an expected result.")); return; }
    setLocal(null);
    const ok = await send({ action: "add", title, family, task: task || null, scenario: scenario || undefined, expect: [{ kind: "rubric", text: expect }] });
    if (ok) { setTitle(""); setExpect(""); }
  };

  return (
    <section className={`${card} mt-6`} aria-labelledby="ts-set">
      <h2 id="ts-set" className="font-display text-xl font-medium">{tr(lang, "ts.set.h", "Test set")}</h2>
      <p className="mt-1 text-sm text-ink-soft">{profile}</p>
      <ChainNote chain={chain} />

      {!mayEdit && <p className="mt-3 text-sm font-medium">{tr(lang, "ts.readonly", "Read only. Changing the tests needs the scenario edit permission.")}</p>}

      {!state.exists ? (
        <div className="mt-4">
          <p className="text-sm">{tr(lang, "ts.empty", "No test set yet. Start from the tests derived from this profile's skill.")}</p>
          {mayEdit && <button type="button" className={`${btnPrimary} mt-3`} disabled={busy} onClick={() => send({ action: "create" })}>{tr(lang, "ts.create", "Create the test set")}</button>}
          <Err msg={error} />
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm" role="status">
            {tr(lang, "ts.cov", "Coverage").concat(": ", String(review.covered), " / ", String(review.total))} · {state.approved && !state.draft ? tr(lang, "ts.state.locked", "Approved and locked") : state.draft ? tr(lang, "ts.state.draft", "Draft (changed since the last approval)") : tr(lang, "ts.state.none", "Not approved")}
            {state.approved && <span className="ms-2 font-mono text-xs text-ink-soft">v{state.approved.version} · {state.approved.hash.slice(0, 12)} · {state.approved.approver}</span>}
          </p>

          {review.gaps.length > 0 && (
            <div className="mt-3 rounded-lg border border-line px-3 py-2">
              <p className="text-sm font-medium">{tr(lang, "ts.gaps", "Gaps that block approval")}</p>
              <ul className="mt-1 list-disc ps-5 text-sm">{review.gaps.map((g) => <li key={g.slot + g.code}>{g.message}</li>)}</ul>
            </div>
          )}

          <h3 className="mt-5 text-base font-medium">{tr(lang, "ts.active", "Active tests")} ({active.length})</h3>
          <ul className="mt-2 space-y-2">
            {active.map((b) => (
              <li key={b.id} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">{b.title}</p>
                  <p className="font-mono text-[11px] text-ink-soft">{b.family}{b.task ? ` · ${b.task}` : ""}{b.scenario ? ` · ${b.scenario}` : ""}{b.derived ? "" : ` · ${tr(lang, "ts.manual", "added by hand")}`}</p>
                </div>
                <ul className="mt-1 list-disc ps-5 text-xs text-ink-soft">{b.expect.map((c, i) => <li key={i}>{c.text}</li>)}</ul>
                {mayEdit && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className={btnGhost} disabled={busy} onClick={() => { setEditing(editing === b.id ? null : b.id); setNewTitle(b.title); }}>{tr(lang, "ts.edit", "Edit title")}</button>
                    <button type="button" className={btnGhost} disabled={busy} onClick={() => { setRetiring(retiring === b.id ? null : b.id); setReason(""); setWaiver(""); }}>{tr(lang, "ts.retire", "Retire")}</button>
                  </div>
                )}
                {editing === b.id && (
                  <div className="mt-2">
                    <label className="block text-xs" htmlFor={`t-${b.id}`}>{tr(lang, "ts.title", "Title")}</label>
                    <input id={`t-${b.id}`} className={field} value={newTitle} maxLength={200} onChange={(e) => setNewTitle(e.target.value)} />
                    <button type="button" className={`${btnPrimary} mt-2`} disabled={busy || !newTitle.trim()} onClick={async () => { if (await send({ action: "edit", id: b.id, changes: { title: newTitle } })) setEditing(null); }}>{tr(lang, "ts.save", "Save")}</button>
                  </div>
                )}
                {retiring === b.id && (
                  <div className="mt-2">
                    <label className="block text-xs" htmlFor={`r-${b.id}`}>{tr(lang, "ts.reason", "Reason (logged)")}</label>
                    <input id={`r-${b.id}`} className={field} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
                    <label className="mt-2 block text-xs" htmlFor={`w-${b.id}`}>{tr(lang, "ts.waiver", "Approver, if this is the only test for a required case")}</label>
                    <select id={`w-${b.id}`} className={field} value={waiver} onChange={(e) => setWaiver(e.target.value)}>
                      <option value="">{tr(lang, "ts.nowaiver", "None")}</option>
                      {approvers.map((a) => <option key={a.title} value={a.title}>{a.title}</option>)}
                    </select>
                    <button type="button" className={`${btnPrimary} mt-2`} disabled={busy || !reason.trim()} onClick={async () => { if (await send({ action: "retire", id: b.id, reason, waiver_approver: waiver || undefined })) setRetiring(null); }}>{tr(lang, "ts.retire.do", "Retire this test")}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {retired.length > 0 && (
            <>
              <h3 className="mt-5 text-base font-medium">{tr(lang, "ts.retired", "Retired tests")} ({retired.length})</h3>
              <ul className="mt-2 space-y-2">
                {retired.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3 text-sm">
                    <span>{b.title} <span className="text-xs text-ink-soft">({b.retired?.reason}{b.retired?.waiver_approver ? ` · ${b.retired.waiver_approver}` : ""})</span></span>
                    {mayEdit && <button type="button" className={btnGhost} disabled={busy} onClick={() => send({ action: "restore", id: b.id, reason: "restored from the screen" })}>{tr(lang, "ts.restore", "Restore")}</button>}
                  </li>
                ))}
              </ul>
            </>
          )}

          {mayEdit && (
            <div className="mt-6 rounded-xl border border-line p-4">
              <h3 className="text-base font-medium">{tr(lang, "ts.add.h", "Add a scenario")}</h3>
              <label className="mt-2 block text-sm" htmlFor="n-title">{tr(lang, "ts.title", "Title")}</label>
              <input id="n-title" className={field} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-sm" htmlFor="n-fam">{tr(lang, "ts.family", "Kind of test")}</label>
                  <select id="n-fam" className={field} value={family} onChange={(e) => setFamily(e.target.value)}>{FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}</select>
                </div>
                <div>
                  <label className="block text-sm" htmlFor="n-task">{tr(lang, "ts.task", "Task")}</label>
                  <select id="n-task" className={field} value={task} onChange={(e) => setTask(e.target.value)}>
                    <option value="">{tr(lang, "ts.notask", "None")}</option>
                    {tasks.map((t) => <option key={t.id} value={t.id}>{t.id} · {t.title}{t.client_facing ? " *" : ""}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm" htmlFor="n-sc">{tr(lang, "ts.scenario", "Scenario (client-facing)")}</label>
                  <select id="n-sc" className={field} value={scenario} onChange={(e) => setScenario(e.target.value)}>
                    <option value="">{tr(lang, "ts.noscenario", "None")}</option>
                    {SCENARIOS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <label className="mt-2 block text-sm" htmlFor="n-exp">{tr(lang, "ts.expect", "Expected result")}</label>
              <textarea id="n-exp" className={field} rows={2} value={expect} maxLength={600} onChange={(e) => setExpect(e.target.value)} />
              <button type="button" className={`${btnPrimary} mt-3`} disabled={busy} onClick={add}>{tr(lang, "ts.add", "Add the scenario")}</button>
            </div>
          )}

          {mayApprove ? (
            <div className="mt-6 rounded-xl border border-line p-4">
              <h3 className="text-base font-medium">{tr(lang, "ts.approve.h", "Approval")}</h3>
              <ApproveBox idp="ts" approvers={approvers} selfAuthor={selfAuthor} disabledReason={approveBlock} busy={busy} onApprove={(a) => send({ action: "approve", ...a })} />
              {state.approved && <button type="button" className={`${btnGhost} mt-3`} disabled={busy} onClick={() => send({ action: "withdraw", reason: "withdrawn from the screen" })}>{tr(lang, "ts.withdraw", "Withdraw the approval")}</button>}
            </div>
          ) : (
            <p className="mt-6 text-sm text-ink-soft">{tr(lang, "ts.noapprove", "Approving needs the scenario approve permission.")}</p>
          )}
          <Err msg={local ?? error} />
        </>
      )}
    </section>
  );
}

const KEYS: (keyof Params)[] = ["accuracy_lower_bound_min", "alignment_controls_min", "alignment_goals_min", "refusal_min", "consistency_min", "audit_completeness_min", "client_facing_compliance_min", "hallucination_max", "rejected_calls_max", "latency_p95_ms_max", "cost_per_case_max", "min_runs_per_test", "min_tests_per_task", "confidence"];

function label(lang: ReturnType<typeof useLang>, k: keyof Params): string {
  switch (k) {
    case "accuracy_lower_bound_min": return tr(lang, "pm.accuracy", "Accuracy, lower bound at least");
    case "alignment_controls_min": return tr(lang, "pm.controls", "Alignment with controls at least");
    case "alignment_goals_min": return tr(lang, "pm.goals", "Alignment with goals at least");
    case "refusal_min": return tr(lang, "pm.refusal", "Correct refusals at least");
    case "consistency_min": return tr(lang, "pm.consistency", "Consistency across repetitions at least");
    case "audit_completeness_min": return tr(lang, "pm.audit", "Audit completeness at least");
    case "client_facing_compliance_min": return tr(lang, "pm.client", "Client-facing compliance at least");
    case "hallucination_max": return tr(lang, "pm.halluc", "Hallucination rate at most");
    case "rejected_calls_max": return tr(lang, "pm.rejected", "Rejected tool calls at most");
    case "latency_p95_ms_max": return tr(lang, "pm.latency", "Latency p95 (ms) at most, optional");
    case "cost_per_case_max": return tr(lang, "pm.cost", "Cost per case at most, optional");
    case "min_runs_per_test": return tr(lang, "pm.runs", "Repetitions of each test");
    case "min_tests_per_task": return tr(lang, "pm.tests", "Smallest number of tests per task");
    default: return tr(lang, "pm.conf", "Confidence level");
  }
}

export function ParamsPanel({ useCaseId, profile, state, chain, floors, defaults, approvers, mayEdit, mayApprove, userId }: {
  useCaseId: string; profile: string; state: ParamState; chain: Chain; floors: Record<string, unknown>; defaults: Params; approvers: Approver[]; mayEdit: boolean; mayApprove: boolean; userId: string;
}) {
  const lang = useLang();
  const { busy, error, send } = useCall(`/api/admin/un/use-cases/${useCaseId}/params`, profile);
  const start = state.pending?.params ?? state.approved?.params ?? defaults;
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(KEYS.map((k) => [k, start[k] === null ? "" : String(start[k])])));
  const proposer = state.pending?.by;
  return (
    <section className={`${card} mt-6`} aria-labelledby="pm-h">
      <h2 id="pm-h" className="font-display text-xl font-medium">{tr(lang, "pm.h", "Verdict parameters")}</h2>
      <p className="mt-1 text-sm text-ink-soft">{tr(lang, "pm.lede", "The thresholds the pilot is judged against. They cannot be looser than the governance floors, and are locked at approval so they cannot move after the results are seen.")}</p>
      <ChainNote chain={chain} />
      <p className="mt-2 text-sm" role="status">
        {state.approved ? <span>{tr(lang, "pm.approved", "Approved")} v{state.approved.version} · <span className="font-mono text-xs">{state.approved.hash.slice(0, 12)}</span> · {state.approved.approver}</span> : tr(lang, "pm.none", "Nothing approved yet. The values below are illustrative defaults.")}
        {state.pending && <span className="ms-2">{tr(lang, "pm.pending", "A proposal is waiting for approval.")}</span>}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {KEYS.map((k) => (
          <div key={k}>
            <label className="block text-sm" htmlFor={`p-${k}`}>{label(lang, k)}</label>
            <input id={`p-${k}`} inputMode="decimal" className={field} value={vals[k]} disabled={!mayEdit} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
            {floors[k] !== undefined && <p className="text-xs text-ink-soft">{tr(lang, "pm.floor", "Governance floor")}: {String(floors[k])}</p>}
          </div>
        ))}
      </div>
      {mayEdit ? (
        <button type="button" className={`${btnPrimary} mt-4`} disabled={busy} onClick={() => send({ action: "propose", params: Object.fromEntries(KEYS.map((k) => [k, vals[k].trim() === "" ? null : Number(vals[k])])) })}>{tr(lang, "pm.propose", "Propose these values")}</button>
      ) : <p className="mt-3 text-sm font-medium">{tr(lang, "pm.readonly", "Read only. Proposing values needs the scenario edit permission.")}</p>}

      {mayApprove && state.pending && (
        <div className="mt-4 rounded-xl border border-line p-4">
          <h3 className="text-base font-medium">{tr(lang, "ts.approve.h", "Approval")}</h3>
          <ApproveBox idp="pm" approvers={approvers} selfAuthor={proposer === userId} disabledReason={chain.ok ? null : tr(lang, "ts.chain.bad", "The log chain is broken; changes are refused until it is repaired.")} busy={busy} onApprove={(a) => send({ action: "approve", ...a })} />
          <button type="button" className={`${btnGhost} mt-3`} disabled={busy} onClick={() => send({ action: "withdraw", reason: "withdrawn from the screen" })}>{tr(lang, "pm.withdraw", "Withdraw the proposal")}</button>
        </div>
      )}
      <Err msg={error} />
    </section>
  );
}
