"use client";

import { useCallback, useEffect, useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import type { Letter } from "@/lib/un/raci";
import { useLang } from "../_components/Lang";
import { btnGhost, field } from "../_components/ui";

interface Cell { default: Letter | null; override: Letter | null; override_id: string | null; effective: Letter | null }
interface Data {
  use_case: { id: string; ext_id: string; title: string; entity: string };
  columns: { id: string; name: string; job_title: string | null; positions: string[] }[];
  steps: { id: string; label: string; cells: Record<string, Cell>; accountable: number; responsible: number }[];
  mayEdit: boolean;
  candidates: { id: string; name: string; job_title: string | null }[];
}
const LETTER_EN: Record<Letter, string> = { R: "Responsible", A: "Accountable", AR: "Responsible and accountable", C: "Consulted", I: "Informed" };
const LETTERS: Letter[] = ["R", "A", "AR", "C", "I"];

async function call(method: "GET" | "POST", url: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { ok: res.ok, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

/** The RACI of one use case: steps down, people across. Each cell shows the letter that applies; for someone who may change it, a choice sets an override (and "default" takes it away). */
export default function RaciMatrix({ useCaseId }: { useCaseId: string }) {
  const lang = useLang();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [add, setAdd] = useState({ user: "", step: "targets", letter: "C" as Letter });

  const apply = useCallback((r: { ok: boolean; json: Record<string, unknown> }) => {
    if (!r.ok) { setError(String(r.json.error ?? "The RACI could not be loaded")); return; }
    setData(r.json as unknown as Data); setError(null);
  }, []);
  const load = useCallback(async () => apply(await call("GET", `/api/admin/un/raci?use_case=${useCaseId}`)), [apply, useCaseId]);
  useEffect(() => {
    let live = true;
    void call("GET", `/api/admin/un/raci?use_case=${useCaseId}`).then((r) => { if (live) apply(r); });
    return () => { live = false; };
  }, [apply, useCaseId]);

  const change = async (body: object) => {
    const r = await call("POST", "/api/admin/un/raci", { use_case_id: useCaseId, ...body });
    setError(r.ok ? null : String(r.json.error ?? "That did not work"));
    await load();
  };

  if (!data) return <p className="text-sm text-ink-soft">{error ?? tr(lang, "ib.loading", "Loading…")}</p>;
  return (
    <div className="space-y-4">
      {error && <p role="alert" className="text-sm text-ember">{error}</p>}
      <p className="text-sm text-ink-soft">{tr(lang, "rc.legend", "R does the work, A answers for it and decides (a person), C is asked first, I is told. Letters decide who is told and who is asked; what each person may do still comes from their role.")}</p>
      <div className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full min-w-[40rem] text-sm">
          <caption className="sr-only">{tr(lang, "rc.cap", "RACI of the use case: steps by people")}</caption>
          <thead className="font-mono text-[11px] tracking-wide text-ink-soft uppercase">
            <tr>
              <th scope="col" className="px-3 py-3 text-start font-normal">{tr(lang, "ib.raci.step", "Step")}</th>
              {data.columns.map((c) => (
                <th key={c.id} scope="col" className="px-3 py-3 text-start font-normal normal-case">
                  <span className="block font-medium text-ink">{c.name}</span>
                  <span className="block text-xs text-ink-soft">{c.job_title ?? "—"}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.steps.map((s) => (
              <tr key={s.id} className="border-t border-line align-top">
                <th scope="row" className="px-3 py-3 text-start font-normal">
                  {s.label}
                  {(s.accountable !== 1 || s.responsible < 1) && <span className="mt-1 block text-xs text-ember">{s.accountable < 1 ? tr(lang, "rc.noA", "Nobody is Accountable.") : s.accountable > 1 ? tr(lang, "rc.manyA", "More than one is Accountable.") : tr(lang, "rc.noR", "Nobody is Responsible.")}</span>}
                </th>
                {data.columns.map((c) => {
                  const cell = s.cells[c.id];
                  return (
                    <td key={c.id} className="px-3 py-3">
                      <span className="inline-flex items-baseline gap-1.5">
                        <span className={`font-mono text-base ${cell.override ? "font-semibold text-lit-deep" : ""}`} title={cell.effective ? tr(lang, `ib.${cell.effective}`, LETTER_EN[cell.effective]) : ""}>{cell.effective ?? "–"}</span>
                        {cell.override && <span className="text-[11px] text-ink-soft">{tr(lang, "rc.over", "changed")}{cell.default ? ` (${cell.default})` : ""}</span>}
                      </span>
                      {data.mayEdit && (
                        <>
                          <label className="sr-only" htmlFor={`rc-${s.id}-${c.id}`}>{`${s.label}: ${c.name}`}</label>
                          <select id={`rc-${s.id}-${c.id}`} className={`${field} mt-1 w-full py-1 text-xs`} value={cell.override ?? ""}
                            onChange={(e) => void (e.target.value ? change({ action: "set", step: s.id, user_id: c.id, letter: e.target.value }) : cell.override_id && change({ action: "clear", id: cell.override_id }))}>
                            <option value="">{tr(lang, "rc.default", "Default")}{cell.default ? ` (${cell.default})` : ""}</option>
                            {LETTERS.map((l) => <option key={l} value={l}>{l}: {tr(lang, `ib.${l}`, LETTER_EN[l])}</option>)}
                          </select>
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.mayEdit && data.candidates.length > 0 && (
        <section aria-labelledby="rc-add" className="rounded-2xl border border-line bg-card p-4">
          <h2 id="rc-add" className="font-display text-lg font-medium">{tr(lang, "rc.add", "Bring someone else in")}</h2>
          <p className="text-xs text-ink-soft">{tr(lang, "rc.add.h", "For example a test author who should be consulted on the targets of this use case.")}</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-xs font-medium">{tr(lang, "rc.person", "Person")}
              <select className={`${field} mt-1`} value={add.user} onChange={(e) => setAdd({ ...add, user: e.target.value })}>
                <option value="">{tr(lang, "pe.choose", "Choose a person")}</option>
                {data.candidates.map((c) => <option key={c.id} value={c.id}>{c.name}{c.job_title ? ` · ${c.job_title}` : ""}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium">{tr(lang, "ib.raci.step", "Step")}
              <select className={`${field} mt-1`} value={add.step} onChange={(e) => setAdd({ ...add, step: e.target.value })}>{data.steps.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
            </label>
            <label className="text-xs font-medium">{tr(lang, "rc.letter", "Letter")}
              <select className={`${field} mt-1`} value={add.letter} onChange={(e) => setAdd({ ...add, letter: e.target.value as Letter })}>{LETTERS.map((l) => <option key={l} value={l}>{l}: {tr(lang, `ib.${l}`, LETTER_EN[l])}</option>)}</select>
            </label>
            <button type="button" className={btnGhost} disabled={!add.user} onClick={() => void change({ action: "set", step: add.step, user_id: add.user, letter: add.letter }).then(() => setAdd({ ...add, user: "" }))}>{tr(lang, "rc.addbtn", "Add")}</button>
          </div>
        </section>
      )}
    </div>
  );
}
