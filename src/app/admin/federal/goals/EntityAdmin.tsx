"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { GOAL_CRITERIA, MAX_GOALS } from "@/lib/un/entity-admin";
import type { EntityGoal } from "@/lib/un/goals";
import { useLang } from "../_components/Lang";
import { btnGhost, btnPrimary, field } from "../_components/ui";

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/admin/un/entities", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: res.ok, error: j.error };
  } catch { return { ok: false, error: "The request failed." }; }
}

/** Add an entity: a name, a sector and (optionally) a first goal. Admin only (the page renders it only for an admin; the API refuses anyone else). */
export function AddEntity() {
  const lang = useLang();
  const router = useRouter();
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function add() {
    setBusy(true); setMsg(null);
    const r = await post({ action: "add", name, sector, goals: goal.trim() ? [{ text: goal, criterion: null }] : [] });
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, text: tr(lang, "en.saved", "Saved.") }); setName(""); setSector(""); setGoal(""); router.refresh(); } else setMsg({ ok: false, text: r.error ?? tr(lang, "gt.failed", "The request failed.") });
  }
  return (
    <details className="mt-6 rounded-2xl border border-line bg-card p-5" data-testid="add-entity">
      <summary className="cursor-pointer text-base font-medium">{tr(lang, "en.add.h", "Add an entity")}</summary>
      <p className="mt-2 max-w-[68ch] text-sm text-ink-soft">{tr(lang, "en.add.lede", "A new entity appears on this screen at once. Link it to a country, import its use cases by CSV, and add its people on the People screen.")}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium" htmlFor="ae-name">{tr(lang, "en.add.name", "Entity name")}</label>
          <input id="ae-name" className={field} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="ae-sector">{tr(lang, "en.add.sector", "Sector (optional)")}</label>
          <input id="ae-sector" className={field} value={sector} maxLength={80} onChange={(e) => setSector(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium" htmlFor="ae-goal">{tr(lang, "en.add.goal", "First goal (optional)")}</label>
          <input id="ae-goal" className={field} value={goal} maxLength={300} onChange={(e) => setGoal(e.target.value)} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className={btnPrimary} disabled={busy || name.trim().length < 3} onClick={() => void add()}>{tr(lang, "en.add.btn", "Add the entity")}</button>
        {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-lit-deep" : "text-ember"}`}>{msg.ok ? "✓" : "✕"} {msg.text}</p>}
      </div>
    </details>
  );
}

type Row = { id?: string; text: string; criterion: string };

/** Edit an entity's goals and hide or unhide it. Admin only. */
export function EntityTools({ name, goals, hidden }: { name: string; goals: EntityGoal[]; hidden: boolean }) {
  const lang = useLang();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(goals.map((g) => ({ id: g.id, text: g.text, criterion: g.criterion ?? "" })));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  async function run(body: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    const r = await post({ ...body, name });
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, text: tr(lang, "en.saved", "Saved.") }); router.refresh(); } else setMsg({ ok: false, text: r.error ?? tr(lang, "gt.failed", "The request failed.") });
  }
  const id = name.replace(/\W+/g, "-");
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        {!hidden && <button type="button" className={btnGhost} aria-expanded={open} aria-controls={`ge-${id}`} onClick={() => setOpen((o) => !o)}>{tr(lang, "en.goals.edit", "Edit goals")}</button>}
        <button type="button" className={btnGhost} disabled={busy} onClick={() => void run({ action: "set_hidden", hidden: !hidden })}>{hidden ? tr(lang, "en.unhide", "Unhide") : tr(lang, "en.hide", "Hide entity")}</button>
        {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-lit-deep" : "text-ember"}`}>{msg.ok ? "✓" : "✕"} {msg.text}</p>}
      </div>
      {!hidden && (
        <div id={`ge-${id}`} hidden={!open} className="mt-3 rounded-lg bg-paper-deep p-3">
          <ul className="space-y-3">
            {rows.map((g, i) => (
              <li key={g.id ?? `new-${i}`} className="grid gap-2 sm:grid-cols-[1fr_16rem_auto] sm:items-end">
                <div>
                  <label className="block text-xs font-medium" htmlFor={`g-${id}-t-${i}`}>{tr(lang, "en.goals.text", "Goal")} {i + 1}{g.id && <> <bdi dir="ltr" className="font-mono text-ink-soft">{g.id}</bdi></>}</label>
                  <input id={`g-${id}-t-${i}`} className={field} value={g.text} maxLength={300} onChange={(e) => set(i, { text: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium" htmlFor={`g-${id}-c-${i}`}>{tr(lang, "en.goals.crit", "Measured by")}</label>
                  <select id={`g-${id}-c-${i}`} className={field} value={g.criterion} onChange={(e) => set(i, { criterion: e.target.value })}>
                    <option value="">{tr(lang, "en.goals.outcome", "An outcome, measured after go-live")}</option>
                    {GOAL_CRITERIA.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <button type="button" className="mb-2 text-xs underline" disabled={rows.length < 2} onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>{tr(lang, "en.goals.remove", "Remove")}</button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            {rows.length < MAX_GOALS && <button type="button" className={btnGhost} onClick={() => setRows((r) => [...r, { text: "", criterion: "" }])}>{tr(lang, "en.goals.add", "Add a goal")}</button>}
            <button type="button" className={btnPrimary} disabled={busy || rows.some((r) => r.text.trim().length < 5)} onClick={() => void run({ action: "set_goals", goals: rows.map((r) => ({ id: r.id, text: r.text, criterion: r.criterion || null })) })}>{tr(lang, "en.goals.save", "Save goals")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
