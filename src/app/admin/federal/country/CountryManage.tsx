"use client";

import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { useLang } from "../_components/Lang";
import { btnGhost, btnPrimary, field } from "../_components/ui";

export interface ManagedCountry {
  id: string; name: string; ruleset: string; ready: boolean; custom: boolean; hidden: boolean;
  target: { target_percent: number; deadline: string | null } | null;
}
type Doc = { title: string; text: string; url?: string };
/** Resolves to whether the request worked. */
type Call = (action: string, body: Record<string, unknown>, stream?: boolean) => Promise<boolean>;

const chip = "inline-flex items-center rounded-full border border-line px-2 py-0.5 font-mono text-[10px] tracking-wide uppercase text-ink-soft";

/** Manage the countries that exist: rename, change the rule set, set a target, hide or unhide, and (for a country created here) edit its policy documents.
 * Admin only (the parent renders it only for an admin and the API refuses anyone else). Every change is a log entry; hiding keeps all data. */
export function CountryManage({ countries, active, rulesets, busy, call, error }: {
  countries: ManagedCountry[]; active: string; rulesets: { id: string; name: string }[]; busy: boolean; call: Call; error: string | null;
}) {
  const lang = useLang();
  const [edit, setEdit] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", ruleset: "", target: "", deadline: "" });
  const [docsFor, setDocsFor] = useState<string | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const open = (c: ManagedCountry) => {
    setEdit(c.id); setDocsFor(null); setSaved(null);
    setForm({ name: c.name, ruleset: c.ruleset, target: c.target ? String(c.target.target_percent) : "", deadline: c.target?.deadline ?? "" });
  };
  async function save(c: ManagedCountry) {
    setSaved(null);
    const changed: Record<string, unknown> = {};
    if (form.name.trim() !== c.name) changed.name = form.name.trim();
    if (form.ruleset !== c.ruleset) changed.ruleset = form.ruleset;
    if (Object.keys(changed).length && !(await call("update_country", { country: c.id, ...changed }))) return;
    if (c.id !== "UAE") {
      const pct = form.target.trim() === "" ? undefined : Number(form.target);
      const dl = form.deadline || null;
      const moved = (pct !== undefined && pct !== c.target?.target_percent) || (dl !== (c.target?.deadline ?? null) && (c.target || dl));
      if (moved && !(await call("set_target", { country: c.id, ...(pct !== undefined ? { target_percent: pct } : {}), deadline: dl }))) return;
    }
    setSaved(tr(lang, "cn.m.saved", "Saved."));
    setEdit(null);
  }
  async function openDocs(c: ManagedCountry) {
    setDocsFor(c.id); setEdit(null); setLoadErr(null);
    try {
      const r = await fetch(`/api/admin/un/country/docs?country=${encodeURIComponent(c.id)}`);
      const j = (await r.json()) as { docs?: Doc[]; error?: string };
      if (!r.ok || !j.docs) { setLoadErr(j.error ?? tr(lang, "gt.failed", "The request failed.")); setDocs([{ title: "", text: "" }]); }
      else setDocs(j.docs.length ? j.docs : [{ title: "", text: "" }]);
    } catch { setLoadErr(tr(lang, "gt.failed", "The request failed.")); setDocs([{ title: "", text: "" }]); }
  }
  const setDoc = (i: number, patch: Partial<Doc>) => setDocs((m) => m.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="rounded-xl border border-line p-4" data-testid="manage-countries">
      <h3 className="font-medium">{tr(lang, "cn.m.h", "Manage countries")}</h3>
      <p className="mt-1 text-sm text-ink-soft">{tr(lang, "cn.m.lede", "Rename a country, change the rule set that judges its verdicts, set its deployment target, or hide it. Hiding keeps all data and can be undone.")}</p>
      <ul className="mt-3 divide-y divide-line">
        {countries.map((c) => (
          <li key={c.id} className="py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="font-medium" dir="auto">{c.name}</span>
              <bdi dir="ltr" className="font-mono text-xs text-ink-soft">{c.id}</bdi>
              {c.id === active && <span className={chip}>{tr(lang, "cn.m.active", "Active")}</span>}
              {c.hidden && <span className={`${chip} border-ember/60 text-ember`}>{tr(lang, "cn.m.hidden", "Hidden")}</span>}
              {!c.ready && <span className={chip}>{tr(lang, "cn.m.needs", "Needs policy documents")}</span>}
              <span className={chip}>{c.custom ? tr(lang, "cn.m.created", "Created here") : tr(lang, "cn.m.builtin", "Built in")}</span>
              <span className="ms-auto flex flex-wrap gap-2">
                <button type="button" className={btnGhost} disabled={busy} onClick={() => (edit === c.id ? setEdit(null) : open(c))} aria-expanded={edit === c.id}>{tr(lang, "cn.m.edit", "Edit")}</button>
                {c.custom && <button type="button" className={btnGhost} disabled={busy} onClick={() => void openDocs(c)} aria-expanded={docsFor === c.id}>{tr(lang, "cn.m.docs", "Replace policy documents")}</button>}
                <button
                  type="button"
                  className={btnGhost}
                  disabled={busy || (!c.hidden && c.id === active)}
                  title={!c.hidden && c.id === active ? tr(lang, "cn.m.hide.active", "The active country cannot be hidden. Switch to another country first.") : undefined}
                  onClick={() => void call("update_country", { country: c.id, hidden: !c.hidden })}
                >
                  {c.hidden ? tr(lang, "cn.m.unhide", "Unhide") : tr(lang, "cn.m.hide", "Hide")}
                </button>
              </span>
            </div>

            {edit === c.id && (
              <div className="mt-3 rounded-lg bg-paper-deep p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium" htmlFor={`m-n-${c.id}`}>{tr(lang, "cn.new.name", "Country name")}</label>
                    <input id={`m-n-${c.id}`} className={field} value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium" htmlFor={`m-r-${c.id}`}>{tr(lang, "cn.new.ruleset", "Rule set that judges its verdicts")}</label>
                    <select id={`m-r-${c.id}`} className={field} value={form.ruleset} onChange={(e) => setForm({ ...form, ruleset: e.target.value })}>{rulesets.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
                  </div>
                  {c.id !== "UAE" ? (
                    <>
                      <div>
                        <label className="block text-sm font-medium" htmlFor={`m-t-${c.id}`}>{tr(lang, "cn.m.target", "Target (% of use cases deployed)")}</label>
                        <input id={`m-t-${c.id}`} type="number" dir="ltr" min={0} max={100} step={1} className={field} value={form.target} placeholder={tr(lang, "cn.m.notarget", "No target set")} onChange={(e) => setForm({ ...form, target: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium" htmlFor={`m-d-${c.id}`}>{tr(lang, "ua.pol.deadline", "Deadline")}</label>
                        <input id={`m-d-${c.id}`} type="date" dir="ltr" className={field} value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
                      </div>
                    </>
                  ) : <p className="text-sm text-ink-soft sm:col-span-2">{tr(lang, "cn.m.uae", "The UAE target is edited in the Policy form on the dashboard (Configure).")}</p>}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className={btnPrimary} disabled={busy || form.name.trim().length < 2} onClick={() => void save(c)}>{tr(lang, "cn.m.save", "Save changes")}</button>
                  <button type="button" className={btnGhost} disabled={busy} onClick={() => setEdit(null)}>{tr(lang, "cn.m.cancel", "Cancel")}</button>
                </div>
              </div>
            )}

            {docsFor === c.id && (
              <div className="mt-3 rounded-lg bg-paper-deep p-3">
                <p className="text-sm text-ink-soft">{tr(lang, "cn.m.docs.h", "Edit the pasted documents and rebuild the knowledge base. The process is re-run under the country's rule set. If the rebuild fails, the previous documents stay.")}</p>
                {loadErr && <p role="alert" className="mt-2 text-sm text-[color:var(--color-v-nogo)]">{loadErr}</p>}
                {docs.map((x, i) => (
                  <div key={i} className="mt-3 grid gap-2">
                    <label className="block text-sm font-medium" htmlFor={`md-t-${c.id}-${i}`}>{tr(lang, "cn.docs.title", "Document title")} {i + 1}</label>
                    <input id={`md-t-${c.id}-${i}`} className={field} value={x.title} maxLength={200} onChange={(e) => setDoc(i, { title: e.target.value })} />
                    <label className="block text-sm font-medium" htmlFor={`md-x-${c.id}-${i}`}>{tr(lang, "cn.docs.text", "Policy text")}</label>
                    <textarea id={`md-x-${c.id}-${i}`} className={`${field} h-36 text-xs`} value={x.text} onChange={(e) => setDoc(i, { text: e.target.value })} />
                    {docs.length > 1 && <button type="button" className="w-fit text-xs underline" onClick={() => setDocs((m) => m.filter((_, j) => j !== i))}>{tr(lang, "cn.m.doc.remove", "Remove this document")}</button>}
                  </div>
                ))}
                <div className="mt-3 flex flex-wrap gap-2">
                  {docs.length < 10 && <button type="button" className={btnGhost} disabled={busy} onClick={() => setDocs((m) => [...m, { title: "", text: "" }])}>{tr(lang, "cn.docs.add", "Add another document")}</button>}
                  <button type="button" className={btnPrimary} disabled={busy} onClick={() => void call("add_policy_docs", { country: c.id, docs: docs.map(({ title, text, url }) => ({ title, text, url })) }, true)}>{tr(lang, "cn.m.docs.rebuild", "Rebuild the knowledge base")}</button>
                  <button type="button" className={btnGhost} disabled={busy} onClick={() => setDocsFor(null)}>{tr(lang, "cn.m.cancel", "Cancel")}</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {saved && !busy && !error && <p role="status" className="mt-2 text-sm">{saved}</p>}
    </div>
  );
}
