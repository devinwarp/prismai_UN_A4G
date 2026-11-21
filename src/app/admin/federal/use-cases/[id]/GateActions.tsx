"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { useLang } from "../../_components/Lang";
import { btnGhost, btnPrimary, field } from "../../_components/ui";

type Opt = { id: string; label: string };
type Approver = { title: string; source: "process_owner" | "job_title" | "governance" };

/** Add a gate to this use case, or waive one through governance. Admin only: the API refuses everyone else. */
export function GateActions({ useCaseId, candidates, waivable, approvers }: { useCaseId: string; candidates: Opt[]; waivable: Opt[]; approvers: Approver[] }) {
  const lang = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // the process owner is the default approver; with no process owner the admin has to choose
  const first = approvers.find((a) => a.source === "process_owner")?.title ?? "";
  const [add, setAdd] = useState({ gate: candidates[0]?.id ?? "", reason: "", source: "requirement", approver: first });
  const [waive, setWaive] = useState({ gate: waivable[0]?.id ?? "", approver: first, reason: "" });
  const call = async (body: object) => {
    setBusy(true); setError(null); setDone(null);
    const res = await fetch(`/api/admin/un/use-cases/${useCaseId}/gates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = (await res.json().catch(() => ({}))) as { error?: string; reruns?: unknown[] };
    setBusy(false);
    if (!res.ok) return setError(d.error ?? tr(lang, "gt.failed", "The request failed."));
    setDone(tr(lang, "gt.saved", "Signed off and written to the log. Affected verdicts were re-run as new runs:") + ` ${d.reruns?.length ?? 0}`);
    router.refresh();
  };
  const lbl = "block text-sm font-medium";
  const options = (
    <>
      <option value="">{tr(lang, "gt.ap.choose", "Choose the approver")}</option>
      {approvers.map((a) => <option key={a.title} value={a.title}>{a.title} ({tr(lang, `gt.ap.${a.source}`, a.source.replace("_", " "))})</option>)}
    </>
  );
  return (
    <div className="mt-5 grid gap-6 lg:grid-cols-2">
      <form onSubmit={(e) => { e.preventDefault(); void call({ action: "add", ...add }); }} className="rounded-2xl border border-line bg-card p-5">
        <h3 className="font-medium">{tr(lang, "gt.uc.addh", "Add a gate to this use case")}</h3>
        {candidates.length === 0 ? <p className="mt-2 text-sm text-ink-soft">{tr(lang, "gt.uc.nocand", "Every known gate already applies.")}</p> : (
          <>
            <label className={`${lbl} mt-3`} htmlFor="ga-gate">{tr(lang, "gt.col.gate", "Gate")}</label>
            <select id="ga-gate" className={field} value={add.gate} onChange={(e) => setAdd({ ...add, gate: e.target.value })}>
              {candidates.map((c) => <option key={c.id} value={c.id}>{tr(lang, `gate.${c.id}`, c.label)}</option>)}
            </select>
            <label className={`${lbl} mt-3`} htmlFor="ga-src">{tr(lang, "gt.uc.from", "It comes from a")}</label>
            <select id="ga-src" className={field} value={add.source} onChange={(e) => setAdd({ ...add, source: e.target.value })}>
              <option value="requirement">{tr(lang, "gt.uc.src.requirement", "requirement")}</option>
              <option value="task">{tr(lang, "gt.uc.src.task", "task")}</option>
              <option value="admin">{tr(lang, "gt.uc.src.admin", "decision by an administrator")}</option>
            </select>
            <label className={`${lbl} mt-3`} htmlFor="ga-reason">{tr(lang, "gt.uc.reason", "Reason")}</label>
            <textarea id="ga-reason" className={field} rows={2} value={add.reason} maxLength={500} required onChange={(e) => setAdd({ ...add, reason: e.target.value })} />
            <label className={`${lbl} mt-3`} htmlFor="ga-app">{tr(lang, "gt.uc.approver", "Approver")}</label>
            <select id="ga-app" className={field} value={add.approver} required onChange={(e) => setAdd({ ...add, approver: e.target.value })}>{options}</select>
            <p className="mt-1 text-xs text-ink-soft">{tr(lang, "gt.ap.h", "Chosen from this process: its process owner (the default) and the job titles in its SOP. A use case with no SOP uses the governance roles until the org chart is built.")}</p>
            <button type="submit" className={`${btnPrimary} mt-3`} disabled={busy}>{tr(lang, "gt.uc.addbtn", "Sign off and add")}</button>
          </>
        )}
      </form>
      <form onSubmit={(e) => { e.preventDefault(); void call({ action: "waive", ...waive }); }} className="rounded-2xl border border-line bg-card p-5">
        <h3 className="font-medium">{tr(lang, "gt.uc.waiveh", "Waive a gate through governance")}</h3>
        <p className="mt-1 text-xs text-ink-soft">{tr(lang, "gt.uc.waive.h", "The gate stays on the list, marked waived, with the approver and reason. It is the only way a rule-set gate stops applying.")}</p>
        {waivable.length === 0 ? <p className="mt-2 text-sm text-ink-soft">{tr(lang, "gt.uc.nowaive", "Nothing to waive.")}</p> : (
          <>
            <label className={`${lbl} mt-3`} htmlFor="gw-gate">{tr(lang, "gt.col.gate", "Gate")}</label>
            <select id="gw-gate" className={field} value={waive.gate} onChange={(e) => setWaive({ ...waive, gate: e.target.value })}>
              {waivable.map((c) => <option key={c.id} value={c.id}>{tr(lang, `gate.${c.id}`, c.label)}</option>)}
            </select>
            <label className={`${lbl} mt-3`} htmlFor="gw-app">{tr(lang, "gt.uc.approver", "Approver")}</label>
            <select id="gw-app" className={field} value={waive.approver} required onChange={(e) => setWaive({ ...waive, approver: e.target.value })}>{options}</select>
            <label className={`${lbl} mt-3`} htmlFor="gw-reason">{tr(lang, "gt.uc.reason", "Reason")}</label>
            <textarea id="gw-reason" className={field} rows={2} value={waive.reason} maxLength={500} required onChange={(e) => setWaive({ ...waive, reason: e.target.value })} />
            <button type="submit" className={`${btnGhost} mt-3`} disabled={busy}>{tr(lang, "gt.uc.waivebtn", "Record the waiver")}</button>
          </>
        )}
      </form>
      {error && <p role="alert" className="text-sm lg:col-span-2" style={{ color: "var(--color-v-nogo)" }}>{error}</p>}
      {done && <p role="status" className="text-sm lg:col-span-2">{done}</p>}
    </div>
  );
}
