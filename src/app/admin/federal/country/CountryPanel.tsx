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
  countries: { id: string; name: string; ready: boolean; onDemand: boolean }[];
  staged: { id: string; title: string; words: number }[];
  euBuilt: boolean;
  companyCount: number;
}

/** The actions of the country screen. Admin only: without canEdit nothing here is rendered as a control, and the API refuses anyone else. */
export function CountryPanel({ canEdit, active, countries, staged, euBuilt, companyCount }: Props) {
  const lang = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [sample, setSample] = useState(true);
  const [sop, setSop] = useState("");
  const [name, setName] = useState("Marina Bay Licensing Authority (synthetic)");
  const t0 = useRef(0);
  useEffect(() => {
    if (!busy) return;
    const i = setInterval(() => setElapsed(Math.round(performance.now() - t0.current)), 100);
    return () => clearInterval(i);
  }, [busy]);

  async function call(action: string, body: Record<string, unknown>, stream = false) {
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
        setNote(`${tr(lang, "cn.elapsed", "Elapsed")}: ${(ms / 1000).toFixed(2)} ${tr(lang, "ub.cn.sec", "s")}` + (out.matchesStored === true ? ` · ${tr(lang, "cn.sameHash", "Identical to the stored result (same head hash)")}` : ""));
        router.refresh();
      }
    } catch { setError(tr(lang, "gt.failed", "The request failed.")); }
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
              <Ct id={c.id} en={c.name} />{c.id === active ? " ✓" : ""}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-line p-4">
        <h3 className="font-medium">{tr(lang, "cn.stepA", "Step A (live): add a policy")}</h3>
        <p className="mt-1 text-sm text-ink-soft">{tr(lang, "cn.stepA.h", "An administrator adds the EU policy as a new knowledge source and the app builds the index on the spot: parse, chunk, index (BM25 and vectors), then registers the scope and its rule set.")}</p>
        <ul className="mt-2 text-xs text-ink-soft">{staged.map((s) => <li key={s.id}><bdi dir="ltr" className="font-mono">{s.id}</bdi> · <Ltr>{s.words}</Ltr> {tr(lang, "ub.cn.words", "words")}</li>)}</ul>
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
          <p className="font-medium">{tr(lang, "cn.elapsed", "Elapsed")}: <bdi dir="ltr" className="font-mono">{(elapsed / 1000).toFixed(1)} {tr(lang, "ub.cn.sec", "s")}</bdi>{busy ? " …" : ""}</p>
          <ol className="mt-2 space-y-1">
            {stages.map((s, i) => <li key={i}><bdi dir="ltr" className="font-mono text-xs">{s.ms} {tr(lang, "ub.cn.ms", "ms")}</bdi> · <En><b>{s.stage}</b>: {s.detail}</En></li>)}
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
