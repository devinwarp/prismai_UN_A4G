"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { useLang } from "../_components/Lang";
import { btnGhost, btnPrimary, field } from "../_components/ui";
import { Ct, En, Ltr } from "../_components/b-bits";

interface Stage { stage: string; ms: number; detail: string }
interface Props {
  canEdit: boolean;
  active: string;
  countries: { id: string; name: string; ready: boolean; onDemand: boolean; custom: boolean }[];
  rulesets: { id: string; name: string }[];
  staged: { id: string; title: string; words: number }[];
  euBuilt: boolean;
  companyCount: number;
}

/** The actions of the country screen. Admin only: without canEdit nothing here is rendered as a control, and the API refuses anyone else. */
export function CountryPanel({ canEdit, active, countries, rulesets, staged, euBuilt, companyCount }: Props) {
  const lang = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false); // set synchronously, so a double-click cannot start a second request before the disabled state renders
  const [note, setNote] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [sample, setSample] = useState(true);
  const [sop, setSop] = useState("");
  const [nc, setNc] = useState({ id: "", name: "", ruleset: rulesets[0]?.id ?? "" });
  const [docs, setDocs] = useState<Record<string, { title: string; text: string }[]>>({});
  const docsOf = (id: string) => docs[id] ?? [{ title: "", text: "" }];
  const setDoc = (id: string, i: number, patch: Partial<{ title: string; text: string }>) => setDocs((m) => ({ ...m, [id]: docsOf(id).map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const [name, setName] = useState("Marina Bay Licensing Authority (synthetic)");
  const t0 = useRef(0);
  useEffect(() => {
    if (!busy) return;
    const i = setInterval(() => setElapsed(Math.round(performance.now() - t0.current)), 100);
    return () => clearInterval(i);
  }, [busy]);

  async function call(action: string, body: Record<string, unknown>, stream = false) {
    if (busyRef.current) return;
    busyRef.current = true;
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
        const ms = Math.round(performance.now() - t0.current);
        if (action === "switch" && out.reran === false) setNote(tr(lang, "hdr.reused", "Rules unchanged: stored result shown"));
        else if (out.noop === true) setNote(tr(lang, "cn.reset.noop", "Already at the starting state. Nothing to reset, nothing logged."));
        else setNote(`${tr(lang, "cn.elapsed", "Elapsed")}: ${(ms / 1000).toFixed(2)} ${tr(lang, "ub.cn.sec", "s")}` + (out.matchesStored === true ? ` Â· ${tr(lang, "cn.sameHash", "Identical to the stored result (same head hash)")}` : ""));
        router.refresh();
      }
    } catch { setError(tr(lang, "gt.failed", "The request failed.")); }
    busyRef.current = false;
    setBusy(null);
  }

  if (!canEdit) return <p className="text-sm text-ink-soft">{tr(lang, "cn.readonly", "Read-only: judges and viewers see the stored result and cannot change it.")}</p>;
  const lbl = "block text-sm font-medium";
  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-medium">{tr(lang, "cn.switch", "Switch to")}</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {countries.filter((c) => c.ready).map((c) => (
            <button key={c.id} type="button" disabled={!!busy || c.id === active} className={c.id === active ? btnPrimary : btnGhost} aria-pressed={c.id === active} onClick={() => void call("switch", { country: c.id })}>
              <Ct id={c.id} en={c.name} />{c.id === active ? " âœ“" : ""}
            </button>
          ))}
          <button type="button" disabled={!!busy} className={btnGhost} onClick={() => void call("run", { company: "marsa", country: active })}>{tr(lang, "cn.rerun", "Run again now")}</button>
        </div>
        <p className="mt-1 text-xs text-ink-soft">{tr(lang, "cn.rerun.h", "Runs the process again under the active country's rules and logs it. An admin can do this whenever it is wanted; a switch alone does not.")}</p>
      </div>

      <div className="rounded-xl border border-line p-4" data-testid="new-country">
        <h3 className="font-medium">{tr(lang, "cn.new.h", "Create a country profile")}</h3>
        <p className="mt-1 text-sm text-ink-soft">{tr(lang, "cn.new.h2", "Add a country the app does not have yet. It appears in the country switch at once and needs its policy documents before the process can be run under it.")}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium" htmlFor="nc-id">{tr(lang, "cn.new.code", "Country code (2 to 6 letters)")}</label>
            <input id="nc-id" className={field} value={nc.id} maxLength={6} onChange={(e) => setNc({ ...nc, id: e.target.value.toUpperCase() })} />
          </div>
          <div>
            <label className="block text-sm font-medium" htmlFor="nc-name">{tr(lang, "cn.new.name", "Country name")}</label>
            <input id="nc-name" className={field} value={nc.name} maxLength={80} onChange={(e) => setNc({ ...nc, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium" htmlFor="nc-rs">{tr(lang, "cn.new.ruleset", "Rule set that judges its verdicts")}</label>
            <select id="nc-rs" className={field} value={nc.ruleset} onChange={(e) => setNc({ ...nc, ruleset: e.target.value })}>{rulesets.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
          </div>
        </div>
        <button type="button" className={`${btnPrimary} mt-3`} disabled={!!busy || !nc.id || !nc.name} onClick={() => void call("add_country", nc)}>{tr(lang, "cn.new.btn", "Create the country")}</button>
      </div>

      {countries.filter((c) => c.custom && !c.ready).map((c) => (
        <div key={c.id} id={`docs-${c.id}`} className="rounded-xl border border-line p-4">
          <h3 className="font-medium">{tr(lang, "cn.docs.h", "Policy documents for {c}").replace("{c}", c.name)}</h3>
          <p className="mt-1 text-sm text-ink-soft">{tr(lang, "cn.docs.h2", "Paste the policy text. The app builds the knowledge base from it (parse, chunk, index), then runs the process under the country's rule set. After that the country can be switched to.")}</p>
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
            <button type="button" className={btnPrimary} disabled={!!busy} onClick={() => void call("add_policy_docs", { country: c.id, docs: docsOf(c.id) }, true)}>{tr(lang, "cn.docs.build", "Build the knowledge base and run the process")}</button>
          </div>
        </div>
      ))}

      <div id="step-a" className="rounded-xl border border-line p-4">
        <h3 className="font-medium">{tr(lang, "cn.stepA", "Step A (live): add a policy")}</h3>
        <p className="mt-1 text-sm text-ink-soft">{tr(lang, "cn.stepA.h", "An administrator adds the EU policy as a new knowledge source and the app builds the index on the spot: parse, chunk, index (BM25 and vectors), then registers the scope and its rule set.")}</p>
        <ul className="mt-2 text-xs text-ink-soft">{staged.map((s) => <li key={s.id}><bdi dir="ltr" className="font-mono">{s.id}</bdi> Â· <Ltr>{s.words}</Ltr> {tr(lang, "ub.cn.words", "words")}</li>)}</ul>
        <button type="button" className={`${btnPrimary} mt-3`} disabled={!!busy || euBuilt} onClick={() => void call("add_policy", { country: "EU" }, true)}>
          {euBuilt ? tr(lang, "cn.built", "EU policy added") : tr(lang, "cn.addpolicy", "Add the EU policy")}
        </button>
      </div>

      <div className="rounded-xl border border-line p-4">
        <h3 className="font-medium">{tr(lang, "cn.stepB", "Step B (live): add a company and its SOP")}</h3>
        <p className="mt-1 text-sm text-ink-soft">{tr(lang, "cn.stepB.h", "A synthetic company with its own SOP for the same licence-renewal use case. The app creates what the run needs, then runs the use case.")}</p>
        <div className="mt-3 grid gap-3">
          <div>
            <label className={lbl} htmlFor="cn-name">{tr(lang, "cn.company", "Company")}</label>
            <input id="cn-name" className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sample} onChange={(e) => setSample(e.target.checked)} /> {tr(lang, "cn.usesample", "Use the staged Marina Bay SOP (synthetic)")}</label>
          {!sample && (
            <div>
              <label className={lbl} htmlFor="cn-sop">{tr(lang, "cn.sop", "SOP text (Markdown)")}</label>
              <textarea id="cn-sop" className={`${field} h-40 font-mono text-xs`} value={sop} onChange={(e) => setSop(e.target.value)} />
            </div>
          )}
        </div>
        <button type="button" className={`${btnPrimary} mt-3`} disabled={!!busy} onClick={() => void call("onboard", { name, country: "SG", ...(sample ? { sample: "sg-mbla" } : { sop_text: sop }) }, true)}>
          {tr(lang, "cn.onboard", "Add the company and run the use case")}
        </button>
        <span className="ms-3 text-xs text-ink-soft"><Ltr>{companyCount}</Ltr></span>
      </div>

      {(busy || stages.length > 0) && (
        <div role="status" aria-live="polite" className="rounded-xl border border-line bg-paper-deep p-4 text-sm">
          <p className="font-medium">{tr(lang, "cn.elapsed", "Elapsed")}: <bdi dir="ltr" className="font-mono">{(elapsed / 1000).toFixed(1)} {tr(lang, "ub.cn.sec", "s")}</bdi>{busy ? " â€¦" : ""}</p>
          <ol className="mt-2 space-y-1">
            {stages.map((s, i) => <li key={i}><bdi dir="ltr" className="font-mono text-xs">{s.ms} {tr(lang, "ub.cn.ms", "ms")}</bdi> Â· <En><b>{s.stage}</b>: {s.detail}</En></li>)}
          </ol>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-[color:var(--color-v-nogo)]">{error}</p>}
      {note && !busy && <p role="status" className="text-sm">{note}</p>}

      <div>
        <button type="button" className={btnGhost} disabled={!!busy} onClick={() => { if (confirm(tr(lang, "cn.reset.h", "Deletes only what this feature created and logs it. Nothing else is touched."))) void call("reset", {}); }}>
          {tr(lang, "cn.reset", "Reset the demo to its starting state")}
        </button>
        <p className="mt-1 text-xs text-ink-soft">{tr(lang, "cn.reset.h", "Deletes only what this feature created and logs it. Nothing else is touched.")}</p>
      </div>
    </div>
  );
}
