"use client";

import { useState } from "react";

export interface SourceMeta {
  id: string; title: string; url: string; issuer: string; jurisdiction: string; instrument_type: string;
  binding: boolean; date: string | null; sha256: string; chunks: number;
}
interface Hit {
  chunk_id: string; score: number; source: string; issuer: string; jurisdiction: string; url: string; sha256: string; quote: string;
}

const EXAMPLES = [
  "who must approve an AI agent before it goes live",
  "human oversight for citizen-facing agents",
  "rights against automated decisions",
  "inferred sensitive data for advertising",
];
const field = "rounded-lg border border-line bg-card px-3 py-2 text-sm";

export default function KbSearch({ sources, sections }: { sources: SourceMeta[]; sections: Record<string, string> }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [vector, setVector] = useState<string>("off");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [jur, setJur] = useState("");
  const [inst, setInst] = useState("");
  const [src, setSrc] = useState("");
  const byId = new Map(sources.map((s) => [s.id, s]));
  const uniq = (f: (s: SourceMeta) => string) => [...new Set(sources.map(f))].sort();

  async function run(query: string) {
    const t = query.trim();
    if (!t) return;
    setQ(t);
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(`/api/admin/un/kb?q=${encodeURIComponent(t)}&k=10`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setHits(j.hits);
      setVector(j.vector);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  const shown = (hits ?? []).filter((h) => {
    const s = byId.get(h.chunk_id.split("#")[0]);
    return (!jur || s?.jurisdiction === jur) && (!inst || s?.instrument_type === inst) && (!src || s?.id === src);
  });

  return (
    <>
      <form onSubmit={(e) => { e.preventDefault(); void run(q); }} className="mt-6 flex flex-wrap gap-3" role="search">
        <label className="min-w-0 flex-1 basis-72">
          <span className="sr-only">Search the knowledge base</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the knowledge base" className={`${field} w-full`} />
        </label>
        <button type="submit" disabled={busy} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-60">
          {busy ? "Searching…" : "Search"}
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        <label>
          <span className="sr-only">Jurisdiction</span>
          <select value={jur} onChange={(e) => setJur(e.target.value)} className={field}>
            <option value="">All jurisdictions</option>{uniq((s) => s.jurisdiction).map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Instrument type</span>
          <select value={inst} onChange={(e) => setInst(e.target.value)} className={field}>
            <option value="">All instrument types</option>{uniq((s) => s.instrument_type).map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Source</span>
          <select value={src} onChange={(e) => setSrc(e.target.value)} className={`${field} max-w-xs`}>
            <option value="">All sources</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}
          </select>
        </label>
      </div>
      <p className="mt-3 text-xs text-ink-soft">Filters apply to the top 10 results of a search.</p>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
        Try:
        {EXAMPLES.map((x) => (
          <button key={x} type="button" onClick={() => void run(x)} className="rounded-full border border-line px-3 py-1 hover:border-ink-soft hover:bg-paper-deep">{x}</button>
        ))}
      </p>

      <div aria-live="polite" className="mt-6">
        {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
        {hits && (
          <>
            <p className="font-mono text-xs text-ink-soft">
              retrieval: {vector === "on" ? "hybrid (BM25 + vector)" : "BM25 (vector off)"} · {shown.length} of {hits.length} hits shown
            </p>
            <ul className="mt-3 grid gap-4">
              {shown.map((h) => {
                const s = byId.get(h.chunk_id.split("#")[0]);
                return (
                  <li key={h.chunk_id} className="rounded-2xl border border-line bg-card p-5">
                    <p className="font-display text-lg">{h.source}</p>
                    <p className="mt-1 text-xs text-ink-soft">
                      {h.issuer} · {h.jurisdiction} · {s?.instrument_type} · {s?.binding ? "binding" : "not binding"} · {s?.date ?? "undated"}
                      {sections[h.chunk_id] ? ` · ${sections[h.chunk_id]}` : ""}
                    </p>
                    <blockquote className="mt-3 border-l-2 border-line pl-3 text-sm">{h.quote}</blockquote>
                    <p className="mt-3 break-all font-mono text-xs text-ink-soft">
                      {h.chunk_id} · <a href={h.url} className="underline">{h.url}</a>
                      <br />sha256 {h.sha256}
                    </p>
                  </li>
                );
              })}
              {shown.length === 0 && <li className="text-sm text-ink-soft">No hits for these filters.</li>}
            </ul>
          </>
        )}
      </div>

      <h2 className="font-display mt-10 text-2xl font-medium tracking-tight">Sources ({sources.length})</h2>
      <p className="mt-2 max-w-[68ch] text-sm text-ink-soft">
        Copyrighted sources are held as short attributed excerpts, not full text.
      </p>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">Knowledge base sources</caption>
          <thead className="text-ink-soft">
            <tr>{["Source", "Jurisdiction", "Type", "Date", "Chunks", "SHA-256"].map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className="border-t border-line align-top">
                <td className="px-3 py-2"><a href={s.url} className="underline">{s.title}</a><br /><span className="font-mono text-ink-soft">{s.id}</span></td>
                <td className="px-3 py-2">{s.jurisdiction}</td>
                <td className="px-3 py-2">{s.instrument_type}{s.binding ? " (binding)" : ""}</td>
                <td className="px-3 py-2 whitespace-nowrap">{s.date ?? "undated"}</td>
                <td className="px-3 py-2">{s.chunks}</td>
                <td className="px-3 py-2 font-mono break-all">{s.sha256}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
