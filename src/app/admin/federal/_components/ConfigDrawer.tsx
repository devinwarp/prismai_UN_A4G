"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { VERDICTS, type Policy, type UnUseCaseState, type Verdict } from "@/lib/un/model";
import type { HitlConfig } from "@/lib/un/hitl";
import { useLang } from "./Lang";
import { Term } from "./Gloss";
import ImportCsv from "./ImportCsv";
import CitizenMessageCheck from "./CitizenMessageCheck";
import HitlEditor from "../HitlEditor";
import { Field, btnPrimary, card, field } from "./ui";
import { verdictHint, verdictName, VERDICT_META } from "./labels";

type Tab = "policy" | "import" | "hitl" | "message";

async function send(url: string, method: string, body: string, type: string) {
  const res = await fetch(url, { method, body, headers: { "Content-Type": type } });
  const data = (await res.json().catch(() => ({}))) as { error?: string; errors?: string[] };
  return { ok: res.ok, data };
}

/**
 * The forms that change things (policy, CSV import, oversight rules) and the citizen-message check, in one side drawer
 * so the dashboard itself stays a single screen. Only an admin sees the three forms; everyone sees the message check.
 * Every panel stays mounted while the drawer is closed, so an unsaved edit or a half-typed message is still there on reopening.
 */
export default function ConfigDrawer({
  policy, canEdit, noTarget, countryId, hitl, useCases, entities, buttonClass,
}: { policy: Policy; canEdit: boolean; noTarget: boolean; /** The active country: the UAE target is the organisation policy row, any other country keeps its own in the country log. */ countryId: string; hitl: HitlConfig; useCases: UnUseCaseState[]; entities: string[]; buttonClass: string }) {
  const router = useRouter();
  const lang = useLang();
  const dlg = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const tabs: [Tab, string][] = [
    ...(canEdit ? ([
      ["policy", tr(lang, "nav.policy", "Policy")],
      ["import", tr(lang, "nav.import", "Import")],
      ["hitl", tr(lang, "nav.hitl", "Oversight rules")],
    ] as [Tab, string][]) : []),
    ["message", tr(lang, "msg.title", "Citizen message check")],
  ];
  const [tab, setTab] = useState<Tab>(tabs[0][0]);
  const [p, setP] = useState(policy);
  const [savedPolicy, setSavedPolicy] = useState(policy);
  const [policyMsg, setPolicyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const pErr = {
    name: p.name.trim() ? null : tr(lang, "ua.pol.err.name", "A policy needs a name."),
    target: Number.isInteger(p.target_percent) && p.target_percent >= 0 && p.target_percent <= 100 ? null : tr(lang, "ua.pol.err.target", "Enter a whole number from 0 to 100."),
    counting: p.counting_verdicts.length ? null : tr(lang, "ua.pol.err.counting", "Pick at least one verdict, or nothing can count as deployed."),
  };
  const policyInvalid = Object.values(pErr).some(Boolean);
  const policyDirty = JSON.stringify(p) !== JSON.stringify(savedPolicy);
  const toggle = (v: Verdict) =>
    setP((x) => ({ ...x, counting_verdicts: x.counting_verdicts.includes(v) ? x.counting_verdicts.filter((c) => c !== v) : [...x.counting_verdicts, v] }));

  async function savePolicy() {
    setBusy(true);
    setPolicyMsg(null);
    const r = countryId === "UAE"
      ? await send("/api/admin/un/policy", "PUT", JSON.stringify(p), "application/json")
      : await send("/api/admin/un/country", "POST", JSON.stringify({ action: "set_target", country: countryId, target_percent: p.target_percent, deadline: p.deadline, counting_verdicts: p.counting_verdicts, name: p.name, jurisdiction: p.jurisdiction, source_url: p.source_url }), "application/json");
    setBusy(false);
    if (r.ok) {
      setSavedPolicy(p);
      setPolicyMsg({ ok: true, text: tr(lang, "ua.pol.saved_msg", "Policy saved. The dashboard now uses it.") });
      router.refresh();
    } else setPolicyMsg({ ok: false, text: (r.data.errors ?? [r.data.error ?? tr(lang, "ua.failed", "Failed")]).join("\n") });
  }

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const next = (i + (rtl ? -step : step) + tabs.length) % tabs.length;
    e.preventDefault();
    setTab(tabs[next][0]);
    document.getElementById(`${uid}-tab-${tabs[next][0]}`)?.focus();
  };

  const title = canEdit ? tr(lang, "ua.sec.configure", "Configure") : tr(lang, "msg.title", "Citizen message check");
  const panel = (id: Tab, children: ReactNode) => (
    <div key={id} role="tabpanel" id={`${uid}-panel-${id}`} aria-labelledby={`${uid}-tab-${id}`} hidden={tab !== id} className="px-5 py-5 sm:px-6">{children}</div>
  );

  return (
    <>
      <button type="button" onClick={() => dlg.current?.showModal()} className={buttonClass}>{title}</button>
      <dialog
        ref={dlg}
        aria-labelledby={`${uid}-title`}
        {...{ closedby: "any" }}
        className="m-0 ms-auto h-dvh max-h-none w-[min(46rem,100vw)] max-w-none border-s-2 border-ink bg-paper p-0 text-ink backdrop:bg-ink/40 open:flex open:flex-col"
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3 sm:px-6">
          <h2 id={`${uid}-title`} className="font-display text-xl font-medium tracking-tight">{title}</h2>
          <button type="button" onClick={() => dlg.current?.close()} className="rounded-lg border border-line bg-paper px-3 py-1 text-sm font-medium hover:border-ink-soft">{tr(lang, "hdr.setup.close", "Close")}</button>
        </div>
        {tabs.length > 1 && (
          <div role="tablist" aria-label={title} className="flex gap-1 overflow-x-auto border-b border-line px-5 pt-2 sm:px-6">
            {tabs.map(([id, label], i) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`${uid}-tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`${uid}-panel-${id}`}
                tabIndex={tab === id ? 0 : -1}
                onClick={() => setTab(id)}
                onKeyDown={(e) => onTabKey(e, i)}
                className={`-mb-px shrink-0 rounded-t-lg border border-b-0 px-3.5 py-2 text-sm ${tab === id ? "border-line bg-card font-medium text-ink" : "border-transparent text-ink-soft hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {canEdit && panel("policy", (
            <>
              <p className="max-w-[68ch] text-sm leading-relaxed text-ink-soft">{tr(lang, "ua.pol.lede", "The framework has not defined what counts as deployed, so the counting rule is explicit and yours to change.")}</p>
              {noTarget && <p className="mt-2 max-w-[68ch] text-sm font-medium">{tr(lang, "ua.pg.notarget", "No framework target is recorded for this country yet.")}</p>}
              <div className={`${card} mt-4 space-y-8`}>
                <fieldset>
                  <legend className="font-mono text-[11px] tracking-[0.2em] text-ink-soft uppercase">{tr(lang, "ua.pol.target", "The target")}</legend>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <Field label={tr(lang, "ua.pol.pct", "Target %")} hint={tr(lang, "ua.pol.pct.h", "Share of use cases that must be deployed.")} error={pErr.target}>
                      <input type="number" dir="ltr" min={0} max={100} step={1} inputMode="numeric" aria-invalid={!!pErr.target} className={field} value={Number.isNaN(p.target_percent) ? "" : p.target_percent} onChange={(e) => setP({ ...p, target_percent: e.target.value === "" ? NaN : Number(e.target.value) })} />
                    </Field>
                    <Field label={tr(lang, "ua.pol.deadline", "Deadline")} hint={tr(lang, "ua.pol.deadline.h", "Announced April 2026 as “within two years”.")}>
                      <input type="date" dir="ltr" className={field} value={p.deadline ?? ""} onChange={(e) => setP({ ...p, deadline: e.target.value || null })} />
                    </Field>
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="font-mono text-[11px] tracking-[0.2em] text-ink-soft uppercase">{tr(lang, "ua.pol.counts", "What counts as deployed")}</legend>
                  <p className="mt-2 text-sm text-ink-soft">{tr(lang, "ua.pol.counts.h", "A use case counts toward the target when its verdict is ticked here.")}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {VERDICTS.map((v) => {
                      const on = p.counting_verdicts.includes(v);
                      return (
                        <label key={v} title={verdictHint(lang, v)} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-lit ${on ? "border-ink bg-paper-deep" : "border-line hover:border-ink-soft"}`}>
                          <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(v)} />
                          <span aria-hidden style={{ color: VERDICT_META[v].color }}>{VERDICT_META[v].glyph}</span>
                          <span className="font-mono text-xs">{lang === "ar" ? verdictName(lang, v) : v}</span>
                          <span aria-hidden className={`text-xs ${on ? "text-ink" : "text-transparent"}`}>✓</span>
                          <span className="sr-only">{on ? tr(lang, "ua.pol.on", "counts as deployed") : tr(lang, "ua.pol.off", "does not count")}</span>
                        </label>
                      );
                    })}
                  </div>
                  {pErr.counting && <p role="alert" className="mt-2 text-xs text-ember">✕ {pErr.counting}</p>}
                </fieldset>

                <details className="group" open>
                  <summary className="w-fit cursor-pointer font-mono text-[11px] tracking-[0.2em] text-ink-soft uppercase">{tr(lang, "ua.pol.name_sum", "Name, jurisdiction and source")} ▾</summary>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <Field label={tr(lang, "ua.pol.name", "Policy name")} error={pErr.name}>
                      <input aria-invalid={!!pErr.name} className={field} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
                    </Field>
                    <Field label={tr(lang, "ua.pol.juris", "Jurisdiction")}>
                      <input className={field} value={p.jurisdiction} onChange={(e) => setP({ ...p, jurisdiction: e.target.value })} />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label={tr(lang, "ua.pol.url", "Source URL")} hint={tr(lang, "ua.pol.url.h", "Where the target was announced; shown to reviewers as the citation.")}>
                        <input type="url" dir="ltr" className={field} value={p.source_url ?? ""} onChange={(e) => setP({ ...p, source_url: e.target.value || null })} />
                      </Field>
                    </div>
                  </div>
                </details>

                <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
                  <button className={btnPrimary} disabled={busy || policyInvalid || !policyDirty} onClick={savePolicy}>{tr(lang, "ua.pol.save", "Save policy")}</button>
                  <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wide uppercase ${policyDirty ? "border-ember/60 text-ember" : "border-line text-ink-soft"}`}>{policyDirty ? `● ${tr(lang, "ua.pol.unsaved", "Unsaved changes")}` : tr(lang, "ua.pol.saved", "Saved")}</span>
                  {policyDirty && (
                    <button type="button" className="text-sm underline underline-offset-2" onClick={() => { setP(savedPolicy); setPolicyMsg(null); }}>{tr(lang, "ua.pol.discard", "Discard changes")}</button>
                  )}
                  {pErr.name && <p role="alert" className="text-sm text-ember">✕ {pErr.name} ({tr(lang, "ua.pol.open", "open “Name, jurisdiction and source”")})</p>}
                  {policyMsg && <p role="status" className={`text-sm whitespace-pre-wrap ${policyMsg.ok ? "text-lit-deep" : "text-ember"}`}>{policyMsg.ok ? "✓" : "✕"} {policyMsg.text}</p>}
                </div>
              </div>
            </>
          ))}
          {canEdit && panel("import", (
            <>
              <p className="max-w-[68ch] text-sm leading-relaxed text-ink-soft">{tr(lang, "ua.imp.lede", "Upload the entity register as CSV. All rows are checked first; a single error blocks the import so the register is never half-updated.")}</p>
              <div className={`${card} mt-4`}><ImportCsv existingIds={useCases.map((u) => u.ext_id)} /></div>
            </>
          ))}
          {canEdit && panel("hitl", (
            <>
              <p className="max-w-[68ch] text-sm leading-relaxed text-ink-soft">{tr(lang, "ua.hitl.lede1", "A use case that breaks a rule in force for its entity fails the final-approval check outright; it is never averaged away. Every")} <Term id="oversight">{tr(lang, "ua.hitl.oversight", "oversight")}</Term> {tr(lang, "ua.hitl.lede2", "rule is on unless switched off.")}</p>
              <div className="mt-4"><HitlEditor entities={entities} config={hitl} useCases={useCases} /></div>
            </>
          ))}
          {panel("message", <CitizenMessageCheck bare />)}
        </div>
      </dialog>
    </>
  );
}
