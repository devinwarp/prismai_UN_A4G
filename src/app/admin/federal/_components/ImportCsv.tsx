"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { parseUseCases, type ParseResult } from "@/lib/un/model";
import { btnGhost, btnPrimary } from "./ui";

type Staged = { name: string; text: string; parsed: ParseResult };
type Done = { n: number; added: number; updated: number };

const COLUMNS: [string, string, boolean][] = [
  ["id", "Unique id, e.g. UC01", true],
  ["entity", "Federal entity that owns it", true],
  ["use_case", "Short title", true],
  ["quadrant", "Internal Agents, Internal RAG, External Agents or External RAG", true],
  ["entity_sector", "Sector label", false],
  ["client_facing", "yes/no: citizens see the output", false],
  ["affects_rights", "yes/no: decides rights or fees", false],
  ["irreversible", "yes/no: actions cannot be undone", false],
  ["human_in_the_loop_rule", "Stated oversight rule", false],
  ["description", "One-line description", false],
];

/** Drop zone with a local preview. Nothing is sent until the file validates and the user confirms. */
export default function ImportCsv({ existingIds }: { existingIds: string[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [staged, setStaged] = useState<Staged | null>(null);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [done, setDone] = useState<Done | null>(null);
  const [busy, setBusy] = useState(false);

  async function stage(f: File | undefined) {
    if (!f) return;
    setDone(null);
    setServerErrors([]);
    const text = await f.text();
    setStaged({ name: f.name, text, parsed: parseUseCases(text) });
  }
  const reset = () => {
    setStaged(null);
    setDone(null);
    setServerErrors([]);
    if (input.current) input.current.value = "";
  };

  async function confirm() {
    if (!staged) return;
    setBusy(true);
    setServerErrors([]);
    const res = await fetch("/api/admin/un/import", { method: "POST", body: staged.text, headers: { "Content-Type": "text/csv" } });
    const d = (await res.json().catch(() => ({}))) as { error?: string; errors?: string[]; imported?: number };
    setBusy(false);
    if (res.ok) {
      const ids = new Set(existingIds);
      const rows = staged.parsed.useCases;
      const updated = rows.filter((r) => ids.has(r.ext_id)).length;
      setDone({ n: d.imported ?? rows.length, added: rows.length - updated, updated });
      setStaged(null);
      router.refresh();
    } else setServerErrors(d.errors ?? [d.error ?? "Import failed"]);
  }

  const errors = staged?.parsed.errors ?? [];
  const rows = staged?.parsed.useCases ?? [];
  const ids = new Set(existingIds);
  const updating = rows.filter((r) => ids.has(r.ext_id)).length;

  return (
    <div>
      {!staged && (
        <label
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void stage(e.dataTransfer.files?.[0]); }}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-lit ${over ? "border-lit bg-lit-soft/50" : "border-line bg-paper hover:border-ink-soft"}`}
        >
          <span aria-hidden className="font-mono text-2xl text-ink-soft">⇪</span>
          <span className="text-sm font-medium">Drop a CSV here, or <span className="underline underline-offset-2">choose a file</span></span>
          <span className="text-xs text-ink-soft">You see a preview and any errors before anything is saved.</span>
          <input ref={input} type="file" accept=".csv,text/csv" aria-label="Choose CSV file" className="sr-only" onChange={(e) => void stage(e.target.files?.[0])} />
        </label>
      )}

      {done && (
        <div role="status" className="mt-3 rounded-xl border border-lit/50 bg-lit-soft/50 p-4 text-sm">
          <p className="font-medium text-lit-deep">✓ Imported {done.n} use cases</p>
          <p className="mt-1 text-ink-soft">{done.added} new, {done.updated} updated. Stage and verdict were kept on existing rows.</p>
          <button type="button" onClick={reset} className="mt-2 text-xs font-medium underline underline-offset-2">Import another file</button>
        </div>
      )}

      {staged && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p><span className="font-mono text-xs">{staged.name}</span> <span className="text-ink-soft">· {errors.length ? `${errors.length} problem${errors.length === 1 ? "" : "s"}` : `${rows.length} rows ready`}</span></p>
            <button type="button" onClick={reset} className="text-xs font-medium underline underline-offset-2">Choose a different file</button>
          </div>

          {errors.length > 0 ? (
            <div role="alert" className="rounded-xl border border-ember/60 bg-paper p-4">
              <p className="text-sm font-medium text-ember">✕ Nothing was imported. Fix these and choose the file again (all rows or none):</p>
              <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-sm">
                {errors.slice(0, 12).map((e) => <li key={e} className="font-mono text-xs">{e}</li>)}
              </ul>
              {errors.length > 12 && <p className="mt-1 text-xs text-ink-soft">…and {errors.length - 12} more.</p>}
            </div>
          ) : (
            <>
              <p className="text-sm text-ink-soft">
                <span className="font-medium text-ink">{rows.length - updating} new</span>, <span className="font-medium text-ink">{updating} existing</span> (descriptions update; stage and verdict stay).
              </p>
              <div className="relative max-h-56 overflow-auto rounded-lg border border-line">
                <table className="w-full min-w-[34rem] text-left text-sm">
                  <caption className="sr-only">Preview of the first rows</caption>
                  <thead className="sticky top-0 bg-card font-mono text-[10px] text-ink-soft uppercase">
                    <tr><th className="px-3 py-2 font-normal">ID</th><th className="font-normal">Entity</th><th className="font-normal">Use case</th><th className="font-normal">Quadrant</th><th className="pr-3 font-normal">New?</th></tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 8).map((r) => (
                      <tr key={r.ext_id} className="border-t border-line">
                        <td className="px-3 py-1.5 font-mono text-xs">{r.ext_id}</td>
                        <td className="max-w-40 truncate pr-2">{r.entity}</td>
                        <td className="max-w-56 truncate pr-2">{r.title}</td>
                        <td className="pr-2 whitespace-nowrap">{r.quadrant}</td>
                        <td className="pr-3 text-xs text-ink-soft">{ids.has(r.ext_id) ? "update" : "new"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 8 && <p className="text-xs text-ink-soft">Showing 8 of {rows.length}.</p>}
              <div className="flex gap-2">
                <button type="button" className={btnPrimary} disabled={busy} onClick={confirm}>{busy ? "Importing…" : `Import ${rows.length} use cases`}</button>
                <button type="button" className={btnGhost} onClick={reset}>Cancel</button>
              </div>
            </>
          )}
          {serverErrors.length > 0 && <p role="alert" className="text-sm whitespace-pre-wrap text-ember">✕ {serverErrors.join("\n")}</p>}
        </div>
      )}

      <details className="mt-4 text-sm">
        <summary className="w-fit cursor-pointer text-xs font-medium underline underline-offset-2">Columns this file can have</summary>
        <ul className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
          {COLUMNS.map(([k, d, req]) => (
            <li key={k}><span className="font-mono text-ink">{k}</span>{req && <span className="ml-1 text-ember" title="Required">*</span>} <span className="text-ink-soft">{d}</span></li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-ink-soft">* required. Column order is free. A sample is in data/un-use-cases.csv.</p>
      </details>
    </div>
  );
}
