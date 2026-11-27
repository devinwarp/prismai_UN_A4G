"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { tr, type Lang } from "@/lib/un/i18n/dict";
import { useLang } from "../_components/Lang";
import { btnGhost, btnPrimary, field } from "../_components/ui";
import { Ct, En, Ltr } from "../_components/b-bits";
import { countryHref, regionalCurrency } from "@/lib/un/country-context";
import { CountryManage, type ManagedCountry } from "./CountryManage";

interface Stage { stage: string; ms: number; detail: string }
interface Props {
  canEdit: boolean;
  active: string;
  selected: string;
  countries: (ManagedCountry & { onDemand: boolean })[];
  countryOptions: Record<Lang, { id: string; name: string }[]>;
  rulesets: { id: string; name: string }[];
  staged: { id: string; title: string; words: number }[];
  euBuilt: boolean;
}

/** The actions of the country screen. Admin only: without canEdit nothing here is rendered as a control, and the API refuses anyone else. */
export function CountryPanel({ canEdit, active, selected, countries, countryOptions, rulesets, staged, euBuilt }: Props) {
  const lang = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const okRef = useRef(false); // whether the last call worked, for a caller that chains two
  const busyRef = useRef(false); // set synchronously, so a double-click cannot start a second request before the disabled state renders
  const [note, setNote] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [nc, setNc] = useState({ id: "", currency: "", ruleset: rulesets[0]?.id ?? "" });
  const [docs, setDocs] = useState<Record<string, { title: string; text: string }[]>>({});
  const docsOf = (id: string) => docs[id] ?? [{ title: "", text: "" }];
  const setDoc = (id: string, i: number, patch: Partial<{ title: string; text: string }>) => setDocs((m) => ({ ...m, [id]: docsOf(id).map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const t0 = useRef(0);
  useEffect(() => {
    if (!busy) return;
    const i = setInterval(() => setElapsed(Math.round(performance.now() - t0.current)), 100);
    return () => clearInterval(i);
  }, [busy]);

  async function call(action: string, body: Record<string, unknown>, stream = false) {
    if (busyRef.current) return;
    busyRef.current = true;
    okRef.current = false;
    setBusy(action); setError(null); setNote(null); setStages([]); setElapsed(0); t0.current = performance.now();
    try {
      const res = await fetch("/api/admin/un/country", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, stream, ...body }) });
      let out: Record<string, unknown> | null = null;
      if (stream && res.body && res.ok) {
        const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
            if (!line.trim()) continue;
            const m = JSON.parse(line) as { stage?: Stage; done?: Record<string, unknown> };
            if (m.stage) setStages((s) => [...s, m.stage!]); else if (m.done) out = m.done;
          }
        }
      } else out = (await res.json()) as Record<string, unknown>;
      setElapsed(Math.round(performance.now() - t0.current));
      if (!res.ok || !out || out.ok === false) setError(String(out?.error ?? tr(lang, "gt.failed", "The request failed.")));
      else {
        setNote(tr(lang, "cn.m.saved", "Saved."));
        okRef.current = true;
        if (action === "add_country" && typeof body.id === "string") router.replace(countryHref("/admin/federal/country#docs-" + body.id, body.id));
        else router.refresh();
      }
    } catch { setError(tr(lang, "gt.failed", "The request failed.")); }
    busyRef.current = false;
    setBusy(null);
  }

  if (!canEdit) return <p className="text-sm text-ink-soft">{tr(lang, "cn.readonly", "Read-only: judges and viewers see the stored result and cannot change it.")}</p>;
  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-medium">{tr(lang, "cn.setup.view", "View country setup")}</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {countries.filter((c) => !c.hidden).map((c) => (
            <Link key={c.id} href={countryHref("/admin/federal/country#manage", c.id)} aria-current={c.id === selected ? "page" : undefined} className={c.id === selected ? btnPrimary : btnGhost}>
              <Ct id={c.id} en={c.name} />
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-line p-4" data-testid="new-country">
        <h3 className="font-medium">{tr(lang, "cn.new.h", "Create a country profile")}</h3>
        <p className="mt-1 text-sm text-ink-soft">{tr(lang, "cn.setup.new_hint", "Add a country the app does not have yet. It appears in the country switch at once and needs its policy documents before you can register entities.")}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium" htmlFor="nc-id">{tr(lang, "cn.new.name", "Country name")}</label>
            <select id="nc-id" className={field} value={nc.id} onChange={(e) => setNc({ ...nc, id: e.target.value, currency: "" })}>
              <option value="">{tr(lang, "cn.setup.choose", "Choose a country")}</option>
              {countryOptions[lang].filter((entry) => !countries.some((current) => current.id === entry.id)).map((entry) => (
                <option value={entry.id} key={entry.id}>{entry.name} ({entry.id})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium" htmlFor="nc-rs">{tr(lang, "cn.new.ruleset", "Rule set that judges its verdicts")}</label>
            <select id="nc-rs" className={field} value={nc.ruleset} onChange={(e) => setNc({ ...nc, ruleset: e.target.value })}>{rulesets.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
          </div>
          <div>
            <label htmlFor="nc-currency" className="text-sm font-medium">{tr(lang, "cn.currency", "Currency code")}</label>
            <input id="nc-currency" className={field} value={nc.currency} placeholder={regionalCurrency(nc.id) ?? "e.g. AED"} maxLength={3} onChange={(e) => setNc({ ...nc, currency: e.target.value.toUpperCase() })} />
          </div>
        </div>
        <button type="button" className={`${btnPrimary} mt-3`} disabled={!!busy || !nc.id || !(nc.currency || regionalCurrency(nc.id))} onClick={() => void call("add_country", nc)}>{tr(lang, "cn.new.btn", "Create the country")}</button>
      </div>

      <CountryManage countries={countries} active={active} rulesets={rulesets} busy={!!busy} call={async (a, b, s) => { await call(a, b, s); return okRef.current; }} error={error} />

      {countries.filter((c) => c.id === selected && c.custom && !c.ready).map((c) => (
        <div key={c.id} id={`docs-${c.id}`} className="rounded-xl border border-line p-4">
          <h3 className="font-medium">{tr(lang, "cn.docs.h", "Policy documents for {c}").replace("{c}", c.name)}</h3>
          <p className="mt-1 text-sm text-ink-soft">{tr(lang, "cn.setup.docs_hint", "Paste the country policy documents to build its knowledge base.")}</p>
          {docsOf(c.id).map((x, i) => (
            <div key={i} className="mt-3 grid gap-2">
              <label className="block text-sm font-medium" htmlFor={`d-${c.id}-t-${i}`}>{tr(lang, "cn.docs.title", "Document title")} {i + 1}</label>
              <input id={`d-${c.id}-t-${i}`} className={field} value={x.title} maxLength={200} onChange={(e) => setDoc(c.id, i, { title: e.target.value })} />
              <label className="block text-sm font-medium" htmlFor={`d-${c.id}-x-${i}`}>{tr(lang, "cn.docs.text", "Policy text")}</label>
              <textarea id={`d-${c.id}-x-${i}`} className={`${field} h-36 text-xs`} value={x.text} onChange={(e) => setDoc(c.id, i, { text: e.target.value })} />
            </div>
          ))}
          <div className="mt-3 flex flex-wrap gap-2">
            {docsOf(c.id).length < 10 && <button type="button" className={btnGhost} disabled={!!busy} onClick={() => setDocs((m) => ({ ...m, [c.id]: [...docsOf(c.id), { title: "", text: "" }] }))}>{tr(lang, "cn.docs.add", "Add another document")}</button>}
            <button type="button" className={btnPrimary} disabled={!!busy} onClick={() => void call("add_policy_docs", { country: c.id, docs: docsOf(c.id), setup_only: true }, true)}>{tr(lang, "cn.setup.build", "Build the knowledge base")}</button>
          </div>
        </div>
      ))}

      {selected === "EU" && <div id="step-a" className="rounded-xl border border-line p-4">
        <h3 className="font-medium">{tr(lang, "cn.stepA", "Step A (live): add a policy")}</h3>
        <p className="mt-1 text-sm text-ink-soft">{tr(lang, "cn.stepA.h", "An administrator adds the EU policy as a new knowledge source and the app builds the index on the spot: parse, chunk, index (BM25 and vectors), then registers the scope and its rule set.")}</p>
        <ul className="mt-2 text-xs text-ink-soft">{staged.map((s) => <li key={s.id}><bdi dir="ltr" className="font-mono">{s.id}</bdi> · <Ltr>{s.words}</Ltr> {tr(lang, "ub.cn.words", "words")}</li>)}</ul>
        <button type="button" className={`${btnPrimary} mt-3`} disabled={!!busy || euBuilt} onClick={() => void call("add_policy", { country: "EU", setup_only: true }, true)}>
          {euBuilt ? tr(lang, "cn.built", "EU policy added") : tr(lang, "cn.addpolicy", "Add the EU policy")}
        </button>
      </div>}

      {(busy || stages.length > 0) && (
        <div role="status" aria-live="polite" className="rounded-xl border border-line bg-paper-deep p-4 text-sm">
          <p className="font-medium">{tr(lang, "cn.elapsed", "Elapsed")}: <bdi dir="ltr" className="font-mono">{(elapsed / 1000).toFixed(1)} {tr(lang, "ub.cn.sec", "s")}</bdi>{busy ? " …" : ""}</p>
          <ol className="mt-2 space-y-1">
            {stages.map((s, i) => <li key={i}><bdi dir="ltr" className="font-mono text-xs">{s.ms} {tr(lang, "ub.cn.ms", "ms")}</bdi> · <En><b>{s.stage}</b>: {s.detail}</En></li>)}
          </ol>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-[color:var(--color-v-nogo)]">{error}</p>}
      {note && !busy && <p role="status" className="text-sm">{note}</p>}

    </div>
  );
}
