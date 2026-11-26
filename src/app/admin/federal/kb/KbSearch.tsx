"use client";

import { useState } from "react";
import { countryHref } from "@/lib/un/country-context";
import { tr } from "@/lib/un/i18n/dict";
import { useLang } from "../_components/Lang";
import { scrollRegion } from "../_components/ui";

export interface SourceMeta {
  id: string; title: string; url: string; issuer: string; jurisdiction: string; instrument_type: string;
  binding: boolean; date: string | null; sha256: string; chunks: number;
}
interface Hit {
  chunk_id: string; score: number; source: string; issuer: string; jurisdiction: string; url: string; sha256: string; quote: string;
}

// The query sent is English (the corpus is English); the label shows in the reader's language.
const EXAMPLES = [
  { q: "who must approve an AI agent before it goes live", k: "ub.kb.ex1" },
  { q: "human oversight for citizen-facing agents", k: "ub.kb.ex2" },
  { q: "rights against automated decisions", k: "ub.kb.ex3" },
  { q: "inferred sensitive data for advertising", k: "ub.kb.ex4" },
];
const hasArabic = (s: string) => /[\u0600-\u06FF]/.test(s);
const field = "rounded-lg border border-line bg-card px-3 py-2 text-sm";

export default function KbSearch({ country, sources, sections }: { country: string; sources: SourceMeta[]; sections: Record<string, string> }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [vector, setVector] = useState<string>("off");
  const lang = useLang();
  const [err, setErr] = useState("");
  const [used, setUsed] = useState<string | null>(null); // English query the API used for an Arabic one
  const [untranslated, setUntranslated] = useState(false);
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
    setUsed(null);
    setUntranslated(false);
    try {
      const r = await fetch(countryHref(`/api/admin/un/kb?q=${encodeURIComponent(t)}&k=10`, country));
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setHits(j.hits);
      setVector(j.vector);
      if (j.query_translated_from === "ar" && j.query_used) setUsed(String(j.query_used));
      else setUntranslated(hasArabic(t));
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr(lang, "ub.kb.fail", "Search failed"));
    } finally {
      setBusy(false);
    }
  }

  const shown = (hits ?? []).filter((h) => {
    const s = byId.get(h.chunk_id.split("#")[0]);
    return (!jur || s?.jurisdiction === jur) && (!inst || s?.instrument_type === inst) && (!src || s?.id === src);
  });

  return (
    <div className="grid min-w-0 gap-4 desk:min-h-0 desk:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] short:gap-3">
      <section className="flex min-w-0 flex-col rounded-xl border border-line bg-card desk:min-h-0" aria-labelledby="kb-query-heading">
        <h2 id="kb-query-heading" className="shrink-0 border-b border-line px-4 py-3 font-display text-xl font-medium">{tr(lang, "workspace.kb.search", "Search and results")}</h2>
        <div {...scrollRegion("kb-query-heading")} className="min-w-0 p-4 desk:min-h-0 desk:flex-1 desk:overflow-auto">
          <form onSubmit={(e) => { e.preventDefault(); void run(q); }} className="flex flex-wrap gap-2" role="search">
            <label className="min-w-0 flex-1 basis-52">
              <span className="sr-only">{tr(lang, "ub.kb.search", "Search the knowledge base")}</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr(lang, "ub.kb.search", "Search the knowledge base")} className={`${field} w-full`} />
            </label>
            <button type="submit" disabled={busy} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-60">
              {busy ? tr(lang, "ub.kb.going", "Searching…") : tr(lang, "ub.kb.go", "Search")}
            </button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2 text-sm [&_label]:min-w-0 [&_select]:max-w-full">
            <label>
              <span className="sr-only">{tr(lang, "ub.kb.jur", "Jurisdiction")}</span>
              <select value={jur} onChange={(e) => setJur(e.target.value)} className={field}>
                <option value="">{tr(lang, "ub.kb.alljur", "All jurisdictions")}</option>{uniq((s) => s.jurisdiction).map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">{tr(lang, "ub.kb.inst", "Instrument type")}</span>
              <select value={inst} onChange={(e) => setInst(e.target.value)} className={field}>
                <option value="">{tr(lang, "ub.kb.allinst", "All instrument types")}</option>{uniq((s) => s.instrument_type).map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">{tr(lang, "ub.kb.src", "Source")}</span>
              <select value={src} onChange={(e) => setSrc(e.target.value)} className={`${field} max-w-xs`}>
                <option value="">{tr(lang, "ub.kb.allsrc", "All sources")}</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}
              </select>
            </label>
          </div>
          <p className="mt-3 text-xs text-ink-soft">{tr(lang, "ub.kb.filters", "Filters apply to the top 10 results of a search.")}</p>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
            {tr(lang, "ub.kb.try", "Try:")}
            {EXAMPLES.map((x) => (
              <button key={x.q} type="button" onClick={() => void run(x.q)} className="rounded-full border border-line px-3 py-1 hover:border-ink-soft hover:bg-paper-deep">{tr(lang, x.k, x.q)}</button>
            ))}
          </p>

          <div aria-live="polite" className="mt-4 border-t border-line pt-4">
            {!hits && !err && !busy && <p className="text-sm text-ink-soft">{tr(lang, "workspace.kb.prompt", "Search for a policy term or choose an example to see its source passages here.")}</p>}
            {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
            {used && <p role="status" className="mb-3 text-sm">{tr(lang, "ub.kb.tr", "Your query was translated to:")} <bdi dir="ltr" lang="en" className="font-medium">{used}</bdi></p>}
            {untranslated && <p role="status" className="mb-3 rounded-lg border border-line bg-paper-deep px-3 py-2 text-sm">{tr(lang, "ub.kb.notr", "The Arabic query could not be translated to English. The translator needs the language model, which is not available here, so this search ran on the Arabic text and may return nothing. Try the question in English.")}</p>}
            {hits && (
              <>
                <p className="font-mono text-xs text-ink-soft">
                  {tr(lang, "ub.kb.ret", "retrieval: {m} · {s} of {n} hits shown").replace("{m}", vector === "on" ? tr(lang, "ub.kb.hybrid", "hybrid (BM25 + vector)") : tr(lang, "ub.kb.bm25", "BM25 (vector off)")).replace("{s}", String(shown.length)).replace("{n}", String(hits.length))}
                </p>
                <ul className="mt-3 divide-y divide-line">
                  {shown.map((h) => {
                    const s = byId.get(h.chunk_id.split("#")[0]);
                    return (
                      <li key={h.chunk_id} className="min-w-0 py-3">
                        <p dir="ltr" lang="en" className="font-display text-start text-lg">{h.source}</p>
                        <p className="mt-1 text-xs text-ink-soft">
                          <bdi dir="ltr" lang="en">{h.issuer} · {h.jurisdiction} · {s?.instrument_type}</bdi> · {s?.binding ? tr(lang, "ub.kb.binding", "binding") : tr(lang, "ub.kb.notbinding", "not binding")} · {s?.date ? <bdi dir="ltr">{s.date}</bdi> : tr(lang, "ub.kb.undated", "undated")}
                          {sections[h.chunk_id] ? <> · <bdi dir="ltr" lang="en">{sections[h.chunk_id]}</bdi></> : ""}
                        </p>
                        <blockquote dir="ltr" lang="en" className="mt-3 border-s-2 border-line ps-3 text-sm">{h.quote}</blockquote>
                        <p dir="ltr" className="mt-3 break-all text-start font-mono text-xs text-ink-soft">
                          {h.chunk_id} · <a href={h.url} className="underline">{h.url}</a>
                          <br />sha256 {h.sha256}
                        </p>
                      </li>
                    );
                  })}
                  {shown.length === 0 && <li className="text-sm text-ink-soft">{tr(lang, "ub.kb.nohits", "No hits for these filters.")}</li>}
                </ul>
              </>
            )}
          </div>
        </div>
      </section>
      <section className="flex min-w-0 flex-col rounded-xl border border-line bg-card desk:min-h-0" aria-labelledby="kb-sources-heading">
        <div className="shrink-0 border-b border-line px-4 py-3">
          <h2 id="kb-sources-heading" className="font-display text-xl font-medium">{tr(lang, "ub.kb.sources", "Sources ({n})").replace("{n}", String(sources.length))}</h2>
          <p className="mt-1 text-xs text-ink-soft">
            {tr(lang, "ub.kb.copy", "Copyrighted sources are held as short attributed excerpts, not full text.")}
          </p>
        </div>
        <div {...scrollRegion("kb-sources-heading")} className="min-w-0 overflow-auto desk:min-h-0 desk:flex-1">
        <table className="w-full min-w-[31rem] text-start text-xs">
          <caption className="sr-only">{tr(lang, "ub.kb.cap", "Knowledge base sources")}</caption>
          <thead className="bg-card text-ink-soft desk:sticky desk:top-0">
            <tr>{([["Source", "ub.kb.th.source"], ["Jurisdiction", "ub.kb.th.jur"], ["Type", "ub.kb.th.type"], ["Date", "ub.kb.th.date"], ["Chunks", "ub.kb.th.chunks"], ["SHA-256", "ub.kb.th.sha"]] as const).map(([h, k]) => <th key={h} scope="col" className="px-3 py-2 text-start font-medium">{tr(lang, k, h)}</th>)}</tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className="border-t border-line align-top">
                <td className="px-3 py-2"><a href={s.url} dir="ltr" lang="en" className="underline">{s.title}</a><br /><bdi dir="ltr" className="font-mono text-ink-soft">{s.id}</bdi></td>
                <td className="px-3 py-2"><bdi dir="ltr" lang="en">{s.jurisdiction}</bdi></td>
                <td className="px-3 py-2"><bdi dir="ltr" lang="en">{s.instrument_type}</bdi>{s.binding ? ` (${tr(lang, "ub.kb.binding", "binding")})` : ""}</td>
                <td className="px-3 py-2 whitespace-nowrap">{s.date ? <bdi dir="ltr">{s.date}</bdi> : tr(lang, "ub.kb.undated", "undated")}</td>
                <td className="px-3 py-2"><bdi dir="ltr">{s.chunks}</bdi></td>
                <td dir="ltr" className="px-3 py-2 text-start font-mono break-all">{s.sha256}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </section>
    </div>
  );
}
