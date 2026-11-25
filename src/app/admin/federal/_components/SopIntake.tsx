"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { countryHref } from "@/lib/un/country-context";
import { tr } from "@/lib/un/i18n/dict";
import { MAX_SOP_CHARS } from "@/lib/un/sop/custom-limits";
import { useLang } from "./Lang";
import { fill } from "./labels";
import { btnGhost, btnPrimary } from "./ui";

export type SopIntakeRow = {
  id: string; code: string; title: string; frozen: boolean;
  sop?: { title: string; version: number; bytes: number | null; profiles: number | null; tasks: number | null; attachedAt: string | null };
};
type Upload = { file?: File; status: "queued" | "running" | "saved" | "error"; error?: string };
const workers = 3;

export default function SopIntake({ country, entity, rows, canEdit }: { country: string; entity?: string; rows: SopIntakeRow[]; canEdit: boolean }) {
  const lang = useLang();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [uploads, setUploads] = useState<Record<string, Upload>>({});
  const t = (key: string, en: string) => tr(lang, key, en);
  const pending = rows.filter((row) => !row.sop && !row.frozen);
  const work = pending.flatMap((row) => {
    const upload = uploads[row.id];
    return upload?.file && (upload.status === "queued" || upload.status === "error") ? [{ row, file: upload.file }] : [];
  });
  const put = (id: string, upload: Upload) => setUploads((current) => ({ ...current, [id]: upload }));

  function choose(id: string, file?: File) {
    if (!file) return;
    if (!/\.(md|markdown|txt)$/i.test(file.name) || !file.size || file.size > MAX_SOP_CHARS) {
      put(id, { status: "error", error: t("intake.invalid", "Choose a non-empty Markdown or text file up to 200 KB.") });
      return;
    }
    put(id, { file, status: "queued" });
  }

  async function analyze() {
    if (running.current || !work.length) return;
    running.current = true;
    setBusy(true);
    const queue = [...work];
    try {
      await Promise.all(Array.from({ length: Math.min(workers, queue.length) }, async () => {
        for (let item = queue.shift(); item; item = queue.shift()) {
          const { row, file } = item;
          put(row.id, { file, status: "running" });
          try {
            const source = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
            if (source.includes("\0")) throw new Error(t("intake.invalid", "Choose a non-empty Markdown or text file up to 200 KB."));
            const response = await fetch(`/api/admin/un/use-cases/${row.id}/profiles`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "attach_custom", intake: true, title: file.name.replace(/\.[^.]+$/, ""), text: source }),
            });
            const result = await response.json().catch(() => ({})) as { error?: string };
            if (!response.ok) throw new Error(result.error ?? t("gt.failed", "The request failed."));
            put(row.id, { status: "saved" });
          } catch (error) {
            put(row.id, { file, status: "error", error: error instanceof Error ? error.message : t("gt.failed", "The request failed.") });
          }
        }
      }));
      router.refresh();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  const done = rows.filter((row) => row.sop || uploads[row.id]?.status === "saved").length;
  return (
    <>
      <button type="button" className="text-xs font-medium underline decoration-line underline-offset-4 hover:decoration-ink" onClick={() => dialog.current?.showModal()}>
        {t("intake.open", "Open SOP intake")}
      </button>
      <dialog ref={dialog} aria-labelledby="sop-intake-title" onCancel={(event) => { if (busy) event.preventDefault(); }}
        className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-[56rem] overflow-auto rounded-xl border border-line bg-card text-ink backdrop:bg-ink/40">
        <div className="sticky top-0 z-10 border-b border-line bg-card px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="sop-intake-title" className="font-display text-xl font-medium">{t("intake.title", "SOP intake")}</h2>
              <p className="mt-1 text-sm text-ink-soft">{entity}</p>
            </div>
            <button type="button" className={btnGhost} disabled={busy} onClick={() => dialog.current?.close()}>{t("hdr.setup.close", "Close")}</button>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink-soft" role="status">{fill(t("setup.sop_count", "{a} of {n} SOPs attached"), { a: done, n: rows.length })}</p>
            {canEdit && pending.length > 0 && <button type="button" className={btnPrimary} disabled={busy || !work.length} onClick={() => void analyze()}>
              {busy ? t("intake.analyzing", "Analyzing files…") : fill(t("intake.analyze", "Upload and analyze ({n})"), { n: work.length })}
            </button>}
          </div>
        </div>
        <div className="p-4">
          {canEdit && pending.length > 0 && <p className="mb-3 text-sm text-ink-soft">{t("intake.hint", "Choose a Markdown or text file for each pending use case, then upload and analyze the selected files together.")}</p>}
          <ul className="divide-y divide-line rounded-lg border border-line">
            {rows.map((row) => {
              const upload = uploads[row.id];
              return (
                <li key={row.id} className="grid min-w-0 gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="min-w-0">
                    <bdi className="font-mono text-xs text-ink-soft">{row.code}</bdi>
                    <h3 className="text-sm font-medium">{row.title}</h3>
                  </div>
                  <div className="min-w-0 text-sm">
                    {row.sop ? <>
                      <Link className="block break-words underline underline-offset-4" href={countryHref(`/admin/federal/sop/${row.id}`, country)}>{row.sop.title}</Link>
                      <p className="mt-1 text-xs text-ink-soft">{fill(t("intake.version", "Version {n}"), { n: row.sop.version })}
                        {row.sop.bytes !== null && <> · {new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(row.sop.bytes / 1000)} KB</>}
                        {row.sop.profiles !== null && <> · {fill(t("intake.profiles", "{n} job profiles"), { n: row.sop.profiles })}</>}
                        {row.sop.tasks !== null && <> · {fill(t("intake.tasks", "{n} tasks"), { n: row.sop.tasks })}</>}
                        {row.sop.attachedAt && <> · <time dateTime={row.sop.attachedAt}>{new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(row.sop.attachedAt))}</time></>}
                      </p>
                    </> : upload?.status === "saved" ? <p className="text-lit-deep">{t("intake.attached", "Attached")}</p>
                      : row.frozen ? <p className="text-ink-soft">{t("intake.frozen", "Deployed use case. Open it to manage SOP changes.")}</p>
                        : canEdit ? <>
                          <input type="file" accept=".md,.markdown,.txt" aria-label={fill(t("intake.choose", "Choose SOP for {id}"), { id: row.code })}
                            disabled={busy} className="w-full min-w-0 rounded-md border border-line bg-paper p-1.5 text-xs file:me-2 file:rounded file:border-0 file:bg-paper-deep file:px-2 file:py-1"
                            onChange={(event) => { choose(row.id, event.target.files?.[0]); event.target.value = ""; }} />
                          {upload?.file && <p className="mt-1 break-words text-xs text-ink-soft">{upload.file.name}{upload.status === "running" ? ` · ${t("intake.analyzing", "Analyzing files…")}` : ""}</p>}
                          {upload?.error && <p role="alert" className="mt-1 text-xs text-ember">{upload.error}</p>}
                        </> : <p className="text-ink-soft">{t("intake.pending", "Awaiting an SOP")}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </dialog>
    </>
  );
}
