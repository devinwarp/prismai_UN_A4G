"use client";

import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { useLang } from "../_components/Lang";
import { btnGhost, btnPrimary, field } from "../_components/ui";

export interface ManagedCountry {
  id: string; name: string; ruleset: string; currency?: string; ready: boolean; custom: boolean; hidden: boolean;
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
  const [form, setForm] = useState({ ruleset: "", currency: "" });
  const [docsFor, setDocsFor] = useState<string | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const open = (c: ManagedCountry) => {
    setEdit(c.id); setDocsFor(null); setSaved(null);
    setForm({ ruleset: c.ruleset, currency: c.currency ?? "" });
  };
  async function save(c: ManagedCountry) {
    setSaved(null);
    const changed: Record<string, unknown> = {};
    if (form.ruleset !== c.ruleset) changed.ruleset = form.ruleset;
    if (form.currency !== (c.currency ?? "")) changed.currency = form.currency;
    if (Object.keys(changed).length && !(await call("update_country", { country: c.id, ...changed }))) return;
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
      <p className="mt-1 text-sm text-ink-soft">{tr(lang, "cn.setup.manage_hint", "Update a country?s rule set or currency, replace its policy sources, or change its visibility.")}</p>
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
                    <label htmlFor={"m-c-" + c.id} className="text-sm font-medium">{tr(lang, "cn.currency", "Currency code")}</label>
                    <input id={"m-c-" + c.id} className={field} value={form.currency} maxLength={3} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium" htmlFor={`m-r-${c.id}`}>{tr(lang, "cn.new.ruleset", "Rule set that judges its verdicts")}</label>
                    <select id={`m-r-${c.id}`} className={field} value={form.ruleset} onChange={(e) => setForm({ ...form, ruleset: e.target.value })}>{rulesets.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className={btnPrimary} disabled={busy} onClick={() => void save(c)}>{tr(lang, "cn.m.save", "Save changes")}</button>
                  <button type="button" className={btnGhost} disabled={busy} onClick={() => setEdit(null)}>{tr(lang, "cn.m.cancel", "Cancel")}</button>
                </div>
              </div>
            )}

            {docsFor === c.id && (
              <div className="mt-3 rounded-lg bg-paper-deep p-3">
                <p className="text-sm text-ink-soft">{tr(lang, "cn.setup.docs_replace_hint", "Edit the policy documents and rebuild the knowledge base.")}</p>
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
                  <button type="button" className={btnPrimary} disabled={busy} onClick={() => void call("add_policy_docs", { country: c.id, docs: docs.map(({ title, text, url }) => ({ title, text, url })), setup_only: true }, true)}>{tr(lang, "cn.m.docs.rebuild", "Rebuild the knowledge base")}</button>
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
