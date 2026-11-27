"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { parseTargetsCsv, TARGET_COLUMNS } from "@/lib/un/targets-csv";
import { parseUseCases, type ParseResult } from "@/lib/un/model";
import { btnGhost, btnPrimary } from "./ui";
import { useLang } from "./Lang";
import { tr } from "@/lib/un/i18n/dict";
import { fill, quadLabel } from "./labels";

type Staged = { name: string; text: string; parsed: ParseResult };
type Done = { n: number; added: number; updated: number; targets?: { proposed: string[]; drafted: string[]; failed: { ext_id: string; error: string }[] } };
type StagedTargets = { name: string; text: string; parsed: ReturnType<typeof parseTargetsCsv> };

// [column, key, English, required]; the column names themselves stay as written in the file.
const COLUMNS: [string, string, string, boolean][] = [
  ["id", "ua.csv.c.id", "Unique id, e.g. UC01", true],
  ["entity", "ua.csv.c.entity", "Federal entity that owns it", true],
  ["use_case", "ua.csv.c.use_case", "Short title", true],
  ["quadrant", "ua.csv.c.quadrant", "Internal Agents, Internal RAG, External Agents or External RAG", true],
  ["entity_sector", "ua.csv.c.sector", "Sector label", false],
  ["client_facing", "ua.csv.c.cf", "yes/no: citizens see the output", false],
  ["affects_rights", "ua.csv.c.rights", "yes/no: decides rights or fees", false],
  ["irreversible", "ua.csv.c.irrev", "yes/no: actions cannot be undone", false],
  ["human_in_the_loop_rule", "ua.csv.c.hitl", "Stated oversight rule", false],
  ["description", "ua.csv.c.desc", "One-line description", false],
];

/** Drop zone with a local preview. Nothing is sent until the file validates and the user confirms. */
export default function ImportCsv({ existingIds, scope }: { existingIds: string[]; scope?: { country: string; entity: string } }) {
  const router = useRouter();
  const lang = useLang();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [staged, setStaged] = useState<Staged | null>(null);
  const [targetsFile, setTargetsFile] = useState<StagedTargets | null>(null);
  const targetsInput = useRef<HTMLInputElement>(null);
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
  async function stageTargets(f: File | undefined) {
    if (!f) return;
    const text = await f.text();
    setTargetsFile({ name: f.name, text, parsed: parseTargetsCsv(text) });
  }
  const reset = () => {
    setTargetsFile(null);
    if (targetsInput.current) targetsInput.current.value = "";
    setStaged(null);
    setDone(null);
    setServerErrors([]);
    if (input.current) input.current.value = "";
  };

  async function confirm() {
    if (!staged) return;
    setBusy(true);
    setServerErrors([]);
    const res = await fetch("/api/admin/un/import", {
      method: "POST",
      body: scope ? JSON.stringify({ csv: staged.text, scope, ...(targetsFile ? { targets_csv: targetsFile.text } : {}) }) : staged.text,
      headers: { "Content-Type": scope ? "application/json" : "text/csv" },
    }).catch(() => null);
    if (!res) {
      setBusy(false);
      setServerErrors([tr(lang, "ua.csv.failed", "Import failed")]);
      return;
    }
    const d = (await res.json().catch(() => ({}))) as { error?: string; errors?: string[]; imported?: number; targets?: { proposed: string[]; drafted: string[]; failed: { ext_id: string; error: string }[] } };
    setBusy(false);
    if (res.ok) {
      const ids = new Set(existingIds);
      const rows = staged.parsed.useCases;
      const updated = rows.filter((r) => ids.has(r.ext_id)).length;
      setDone({ n: d.imported ?? rows.length, added: rows.length - updated, updated, targets: d.targets });
      setStaged(null);
      router.refresh();
    } else setServerErrors(d.errors ?? [d.error ?? tr(lang, "ua.csv.failed", "Import failed")]);
  }

  const rows = staged?.parsed.useCases ?? [];
  const errors = [...(staged?.parsed.errors ?? []),
    ...(scope && rows.some((row) => row.entity !== scope.entity)
      ? [fill(tr(lang, "setup.csv_entity", "Every CSV row must use {entity} in the entity column."), { entity: scope.entity })] : [])];
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
          <span className="text-sm font-medium">{tr(lang, "ua.csv.drop", "Drop a CSV here, or")} <span className="underline underline-offset-2">{tr(lang, "ua.csv.choose", "choose a file")}</span></span>
          <span className="text-xs text-ink-soft">{tr(lang, "ua.csv.preview", "You see a preview and any errors before anything is saved.")}</span>
          <input ref={input} type="file" accept=".csv,text/csv" aria-label={tr(lang, "ua.csv.aria", "Choose CSV file")} className="sr-only" onChange={(e) => void stage(e.target.files?.[0])} />
        </label>
      )}

      {done && (
        <div role="status" className="mt-3 rounded-xl border border-lit/50 bg-lit-soft/50 p-4 text-sm">
          <p className="font-medium text-lit-deep">✓ {fill(tr(lang, "ua.csv.imported", "Imported {n} use cases"), { n: done.n })}</p>
          <p className="mt-1 text-ink-soft">{fill(tr(lang, "ua.csv.summary", "{a} new, {u} updated. Stage and verdict were kept on existing rows."), { a: done.added, u: done.updated })}</p>
          {done.targets && (
            <p className="mt-1 text-ink-soft">
              {done.targets.proposed.length > 0 && <>{fill(tr(lang, "ua.csv.tg.file", "Targets proposed from your file for {n} use cases."), { n: done.targets.proposed.length })} </>}
              {done.targets.drafted.length > 0 && <>{fill(tr(lang, "ua.csv.tg.agent", "The targets agent drafted targets for {n} use cases. A person edits and approves them from the notification."), { n: done.targets.drafted.length })}</>}
            </p>
          )}
          {done.targets && done.targets.failed.length > 0 && <p role="alert" className="mt-1 text-ember">✕ {done.targets.failed.map((f) => `${f.ext_id}: ${f.error}`).join(" · ")}</p>}
          <button type="button" onClick={reset} className="mt-2 text-xs font-medium underline underline-offset-2">{tr(lang, "ua.csv.another", "Import another file")}</button>
        </div>
      )}

      {staged && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p><bdi dir="ltr" className="font-mono text-xs">{staged.name}</bdi> <span className="text-ink-soft">· {errors.length ? (lang === "ar" ? fill(tr(lang, "ua.csv.problems", "{n} problems"), { n: errors.length }) : `${errors.length} problem${errors.length === 1 ? "" : "s"}`) : fill(tr(lang, "ua.csv.ready", "{n} rows ready"), { n: rows.length })}</span></p>
            <button type="button" onClick={reset} className="text-xs font-medium underline underline-offset-2">{tr(lang, "ua.csv.different", "Choose a different file")}</button>
          </div>

          {errors.length > 0 ? (
            <div role="alert" className="rounded-xl border border-ember/60 bg-paper p-4">
              <p className="text-sm font-medium text-ember">✕ {tr(lang, "ua.csv.nothing", "Nothing was imported. Fix these and choose the file again (all rows or none):")}</p>
              <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-sm">
                {errors.slice(0, 12).map((e) => <li key={e} dir="ltr" className="font-mono text-xs text-start">{e}</li>)}
              </ul>
              {errors.length > 12 && <p className="mt-1 text-xs text-ink-soft">{fill(tr(lang, "ua.csv.more", "…and {n} more."), { n: errors.length - 12 })}</p>}
            </div>
          ) : (
            <>
              <p className="text-sm text-ink-soft">
                <span className="font-medium text-ink">{fill(tr(lang, "ua.csv.new", "{n} new"), { n: rows.length - updating })}</span>{tr(lang, "ua.csv.comma", ",")} <span className="font-medium text-ink">{fill(tr(lang, "ua.csv.existing", "{n} existing"), { n: updating })}</span> {tr(lang, "ua.csv.existing_h", "(descriptions update; stage and verdict stay).")}
              </p>
              <div className="relative max-h-56 overflow-auto rounded-lg border border-line">
                <table className="w-full min-w-[34rem] text-start text-sm">
                  <caption className="sr-only">{tr(lang, "ua.csv.cap", "Preview of the first rows")}</caption>
                  <thead className="sticky top-0 bg-card font-mono text-[10px] text-ink-soft uppercase">
                    <tr><th className="px-3 py-2 font-normal">{tr(lang, "ua.col.id", "ID")}</th><th className="font-normal">{tr(lang, "ua.f.entity", "Entity")}</th><th className="font-normal">{tr(lang, "ua.col.uc", "Use case")}</th><th className="font-normal">{tr(lang, "ua.col.quad", "Quadrant")}</th><th className="pe-3 font-normal">{tr(lang, "ua.csv.newq", "New?")}</th></tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 8).map((r) => (
                      <tr key={r.ext_id} className="border-t border-line">
                        <td className="px-3 py-1.5 font-mono text-xs"><bdi dir="ltr">{r.ext_id}</bdi></td>
                        <td className="max-w-40 truncate pe-2" title={r.entity}>{r.entity}</td>
                        <td className="max-w-56 truncate pe-2" title={r.title}>{r.title}</td>
                        <td className="pe-2 whitespace-nowrap">{quadLabel(lang, r.quadrant)}</td>
                        <td className="pe-3 text-xs text-ink-soft">{ids.has(r.ext_id) ? tr(lang, "ua.csv.update", "update") : tr(lang, "ua.csv.newv", "new")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 8 && <p className="text-xs text-ink-soft">{fill(tr(lang, "ua.csv.showing", "Showing 8 of {n}."), { n: rows.length })}</p>}
              {scope && (
                <div className="rounded-lg border border-line p-3">
                  <p className="text-sm font-medium">{tr(lang, "ua.csv.tg.h", "Process targets file (optional)")}</p>
                  <p className="mt-1 text-xs text-ink-soft">{tr(lang, "ua.csv.tg.lede", "Leave it out and the targets agent drafts the targets from the entity goals. Add your own and they are proposed instead. Either way a person approves them.")}</p>
                  <input ref={targetsInput} type="file" accept=".csv,text/csv" aria-label={tr(lang, "ua.csv.tg.aria", "Choose targets CSV file")} className="mt-2 block w-full text-xs" onChange={(e) => void stageTargets(e.target.files?.[0])} />
                  {targetsFile && (targetsFile.parsed.errors.length > 0
                    ? <ul role="alert" className="mt-2 max-h-32 space-y-1 overflow-auto text-xs text-ember">{targetsFile.parsed.errors.slice(0, 8).map((e) => <li key={e} dir="ltr" className="font-mono text-start">✕ {e}</li>)}</ul>
                    : <p role="status" className="mt-2 text-xs text-ink-soft">{fill(tr(lang, "ua.csv.tg.ready", "{n} targets for {u} use cases ready."), { n: [...targetsFile.parsed.byUseCase.values()].reduce((a, t) => a + t.length, 0), u: targetsFile.parsed.byUseCase.size })}</p>)}
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" className={btnPrimary} disabled={busy || (!!targetsFile && targetsFile.parsed.errors.length > 0)} onClick={confirm}>{busy ? tr(lang, "ua.csv.importing", "Importing…") : fill(tr(lang, "ua.csv.import", "Import {n} use cases"), { n: rows.length })}</button>
                <button type="button" className={btnGhost} onClick={reset}>{tr(lang, "ua.cancel", "Cancel")}</button>
              </div>
            </>
          )}
          {serverErrors.length > 0 && <p role="alert" className="text-sm whitespace-pre-wrap text-ember">✕ {serverErrors.join("\n")}</p>}
        </div>
      )}

      <details className="mt-4 text-sm">
        <summary className="w-fit cursor-pointer text-xs font-medium underline underline-offset-2">{tr(lang, "ua.csv.cols", "Columns this file can have")}</summary>
        <ul className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
          {COLUMNS.map(([k, dk, d, req]) => (
            <li key={k}><bdi dir="ltr" className="font-mono text-ink">{k}</bdi>{req && <span className="ms-1 text-ember" title={tr(lang, "ua.csv.required", "Required")}>*</span>} <span className="text-ink-soft">{tr(lang, dk, d)}</span></li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-ink-soft">{tr(lang, "ua.csv.note", "* required. Column order is free. A sample is in")} <bdi dir="ltr">data/un-use-cases.csv</bdi>.</p>
        {scope && <>
          <p className="mt-3 text-xs font-medium">{tr(lang, "ua.csv.tg.cols", "Columns of the optional targets file (one row per target)")}</p>
          <ul className="mt-1 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            {TARGET_COLUMNS.map((c) => <li key={c.name}><bdi dir="ltr" className="font-mono text-ink">{c.name}</bdi>{c.required && <span className="ms-1 text-ember" title={tr(lang, "ua.csv.required", "Required")}>*</span>} <span className="text-ink-soft">{c.note}</span></li>)}
          </ul>
        </>}
      </details>
    </div>
  );
}
