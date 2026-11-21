"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { CATEGORIES, EVIDENCE_SOURCES, FLAGS, RULESET_IDS, ROLE_IDS, type GateDef } from "@/lib/un/governance";
import type { Approver } from "@/lib/un/approvers";
import { useLang } from "../_components/Lang";
import { btnGhost, btnPrimary, field } from "../_components/ui";
import { Flag, Rs } from "../_components/b-bits";

const blank = { gate: "", label: "", owner: "compliance", category: "functional", evidence: "reviewer", requires: [] as string[], rulesets: [] as string[], reason: "", approver: "", mname: "", mop: "<=", mthreshold: "", munit: "" };

/** Add an administrator-defined gate, or change one added earlier. Admin only: the API refuses everyone else. */
export function GateForm({ custom, approvers }: { custom: Record<string, GateDef>; approvers: Approver[] }) {
  const lang = useLang();
  const router = useRouter();
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const changing = Object.hasOwn(custom, f.gate);
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setF((x) => ({ ...x, [k]: v }));
  const toggle = (k: "requires" | "rulesets", v: string) => set(k, f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v]);
  const load = (id: string) => {
    const g = custom[id];
    setF(g ? { gate: id, label: g.label, owner: g.owner, category: g.category, evidence: g.evidence, requires: g.requires ?? [], rulesets: g.rulesets ?? [], reason: "", approver: "", mname: g.metric?.name ?? "", mop: g.metric?.op ?? "<=", mthreshold: g.metric ? String(g.metric.threshold) : "", munit: g.metric?.unit ?? "" } : blank);
  };
  const submit = async () => {
    setBusy(true); setError(null); setDone(null);
    const body = {
      gate: f.gate, label: f.label, owner: f.owner, category: f.category, evidence: f.evidence, requires: f.requires, rulesets: f.rulesets, reason: f.reason, approver: f.approver,
      ...(f.evidence === "metric" ? { metric: { name: f.mname, op: f.mop, threshold: Number(f.mthreshold), unit: f.munit } } : {}),
    };
    const res = await fetch("/api/admin/un/gates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = (await res.json().catch(() => ({}))) as { error?: string; reruns?: unknown[] };
    setBusy(false);
    if (!res.ok) return setError(d.error ?? tr(lang, "gt.failed", "The request failed."));
    setDone(tr(lang, "gt.saved", "Signed off and written to the log. Affected verdicts were re-run as new runs:") + ` ${d.reruns?.length ?? 0}`);
    setF(blank);
    router.refresh();
  };
  const lbl = "block text-sm font-medium";
  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="grid gap-4 sm:grid-cols-2">
      {Object.keys(custom).length > 0 && (
        <div className="sm:col-span-2">
          <label className={lbl} htmlFor="gf-load">{tr(lang, "gt.f.change", "Change a gate added earlier")}</label>
          <select id="gf-load" className={field} value={changing ? f.gate : ""} onChange={(e) => load(e.target.value)}>
            <option value="">{tr(lang, "gt.f.new", "None: add a new gate")}</option>
            {Object.keys(custom).map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className={lbl} htmlFor="gf-id">{tr(lang, "gt.f.id", "Gate id")}</label>
        <input id="gf-id" className={field} value={f.gate} onChange={(e) => set("gate", e.target.value)} readOnly={changing} placeholder="response_time" dir="ltr" required pattern="[a-z][a-z0-9_]{2,40}" />
        <p className="mt-1 text-xs text-ink-soft">{tr(lang, "gt.f.id.h", "Lower-case letters, digits and underscores.")}</p>
      </div>
      <div>
        <label className={lbl} htmlFor="gf-label">{tr(lang, "gt.f.label", "What the gate checks")}</label>
        <input id="gf-label" className={field} value={f.label} onChange={(e) => set("label", e.target.value)} maxLength={200} required />
      </div>
      <div>
        <label className={lbl} htmlFor="gf-owner">{tr(lang, "gt.f.owner", "Owner role")}</label>
        <select id="gf-owner" className={field} value={f.owner} onChange={(e) => set("owner", e.target.value)}>
          {ROLE_IDS.filter((r) => r !== "coordinator").map((r) => <option key={r} value={r}>{tr(lang, `ub.role.${r}`, r)}</option>)}
        </select>
      </div>
      <div>
        <label className={lbl} htmlFor="gf-cat">{tr(lang, "gt.f.cat", "Category")}</label>
        <select id="gf-cat" className={field} value={f.category} onChange={(e) => set("category", e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{tr(lang, `gt.cat.${c}`, c)}</option>)}
        </select>
      </div>
      <div>
        <label className={lbl} htmlFor="gf-ev">{tr(lang, "gt.f.ev", "Evidence source")}</label>
        <select id="gf-ev" className={field} value={f.evidence} onChange={(e) => set("evidence", e.target.value)}>
          {EVIDENCE_SOURCES.map((s) => <option key={s} value={s}>{tr(lang, `gt.ev.${s}`, s)}</option>)}
        </select>
      </div>
      <fieldset>
        <legend className={lbl}>{tr(lang, "gt.f.requires", "Applies only when the use case is")}</legend>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {FLAGS.map((x) => <label key={x} className="flex items-center gap-2"><input type="checkbox" checked={f.requires.includes(x)} onChange={() => toggle("requires", x)} /> <span className="font-mono text-xs"><Flag id={x} /></span></label>)}
        </div>
        <p className="mt-1 text-xs text-ink-soft">{tr(lang, "gt.f.requires.h", "Leave all unticked to apply to every use case that requires it.")}</p>
      </fieldset>
      <fieldset className="sm:col-span-2">
        <legend className={lbl}>{tr(lang, "gt.f.rulesets", "Rule sets that require it")}</legend>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {RULESET_IDS.map((x) => <label key={x} className="flex items-center gap-2"><input type="checkbox" checked={f.rulesets.includes(x)} onChange={() => toggle("rulesets", x)} /> <span className="font-mono text-xs"><Rs id={x} /></span></label>)}
        </div>
        <p className="mt-1 text-xs text-ink-soft">{tr(lang, "gt.f.rulesets.h", "With none ticked, the gate applies only to use cases that add it themselves.")}</p>
      </fieldset>
      {f.evidence === "metric" && (
        <fieldset className="grid gap-3 sm:col-span-2 sm:grid-cols-4">
          <legend className={lbl}>{tr(lang, "gt.f.metric", "Measured value and threshold")}</legend>
          <div><label className="text-xs" htmlFor="gf-mn">{tr(lang, "gt.f.mname", "Measure")}</label><input id="gf-mn" className={field} value={f.mname} onChange={(e) => set("mname", e.target.value)} required /></div>
          <div><label className="text-xs" htmlFor="gf-mo">{tr(lang, "gt.f.mop", "Must be")}</label>
            <select id="gf-mo" className={field} value={f.mop} onChange={(e) => set("mop", e.target.value)}><option value="<=">{tr(lang, "gt.f.le", "at most")}</option><option value=">=">{tr(lang, "gt.f.ge", "at least")}</option></select></div>
          <div><label className="text-xs" htmlFor="gf-mt">{tr(lang, "gt.f.mthr", "Threshold")}</label><input id="gf-mt" className={field} inputMode="decimal" value={f.mthreshold} onChange={(e) => set("mthreshold", e.target.value)} required /></div>
          <div><label className="text-xs" htmlFor="gf-mu">{tr(lang, "gt.f.munit", "Unit")}</label><input id="gf-mu" className={field} value={f.munit} onChange={(e) => set("munit", e.target.value)} required /></div>
          <p className="text-xs text-ink-soft sm:col-span-4">{tr(lang, "gt.f.msim", "Simulated: until Sijil and the eval results feed measured values, this gate reads a made-up value and says so wherever it is shown.")}</p>
        </fieldset>
      )}
      <div className="sm:col-span-2">
        <label className={lbl} htmlFor="gf-reason">{tr(lang, "gt.f.reason", "Reason for the change")}</label>
        <textarea id="gf-reason" className={field} rows={2} value={f.reason} onChange={(e) => set("reason", e.target.value)} maxLength={500} required={changing} />
      </div>
      <div className="sm:col-span-2">
        <label className={lbl} htmlFor="gf-app">{tr(lang, "gt.uc.approver", "Approver")}</label>
        <select id="gf-app" className={field} value={f.approver} required onChange={(e) => set("approver", e.target.value)}>
          <option value="">{tr(lang, "gt.ap.choose", "Choose the approver")}</option>
          {approvers.map((a) => <option key={a.title} value={a.title}>{a.title} ({tr(lang, `gt.ap.${a.source}`, a.source)})</option>)}
        </select>
        <p className="mt-1 text-xs text-ink-soft">{tr(lang, "gt.ap.h.gov", "Changes to the gate catalogue belong to no single process, so a governance role approves them.")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" className={btnPrimary} disabled={busy}>{changing ? tr(lang, "gt.f.save", "Sign off and save the change") : tr(lang, "gt.f.add", "Sign off and add the gate")}</button>
        <button type="button" className={btnGhost} disabled={busy} onClick={() => setF(blank)}>{tr(lang, "gt.f.clear", "Clear")}</button>
        <span className="text-xs text-ink-soft">{tr(lang, "gt.f.note", "The approver you choose is the sign-off in the gate log; your sign-in is recorded as who made the change.")}</span>
      </div>
      {error && <p role="alert" className="text-sm sm:col-span-2" style={{ color: "var(--color-v-nogo)" }}>{error}</p>}
      {done && <p role="status" className="text-sm sm:col-span-2">{done}</p>}
    </form>
  );
}
