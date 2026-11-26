"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { VERDICTS, type Policy, type Verdict } from "@/lib/un/model";
import { useLang } from "../_components/Lang";
import { Field, btnPrimary, card, field } from "../_components/ui";
import { verdictHint, verdictName, VERDICT_META } from "../_components/labels";

async function send(url: string, method: string, body: string, type: string) {
  const res = await fetch(url, { method, body, headers: { "Content-Type": type } });
  const data = (await res.json().catch(() => ({}))) as { error?: string; errors?: string[] };
  return { ok: res.ok, data };
}

export default function CountryPolicy({ policy, noTarget, countryId }: { policy: Policy; noTarget: boolean; countryId: string }) {
  const router = useRouter();
  const lang = useLang();
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

  return (
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
  );
}
