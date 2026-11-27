"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { GOAL_CRITERIA, MAX_GOALS } from "@/lib/un/entity-admin";
import { parseGoalMeasurement, type EntityGoal } from "@/lib/un/goals";
import { countryHref } from "@/lib/un/country-context";
import { useLang } from "../_components/Lang";
import { btnGhost, btnPrimary, field } from "../_components/ui";

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; goals?: EntityGoal[] }> {
  try {
    const res = await fetch("/api/admin/un/entities", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = (await res.json().catch(() => ({}))) as { error?: string; goals?: EntityGoal[] };
    return { ok: res.ok, error: j.error, goals: j.goals };
  } catch { return { ok: false, error: "The request failed." }; }
}

type Row = { id?: string; text: string; criterion: string; measure: string; comparison: "at_least" | "at_most"; value: string; unit: string };
const blankGoal: Row = { text: "", criterion: "", measure: "", comparison: "at_least", value: "", unit: "" };

const goalRows = (goals: EntityGoal[]): Row[] => goals.length ? goals.map((g) => ({
  ...blankGoal, id: g.id, text: g.text, criterion: g.criterion ?? "", measure: g.measurement?.criterion ?? "",
  comparison: g.measurement?.comparison ?? "at_least", value: g.measurement?.value.toString() ?? "", unit: g.measurement?.unit ?? "",
})) : [blankGoal];

const measurement = (row: Row) => row.measure.trim() || row.value.trim() || row.unit.trim()
  ? { criterion: row.measure, comparison: row.comparison, value: row.value.trim() ? Number(row.value) : null, unit: row.unit } : undefined;

function goalPayload(row: Row) {
  return { id: row.id, text: row.text, criterion: row.criterion || null, measurement: measurement(row) };
}

function validGoal(row: Row, required: boolean) {
  const measure = measurement(row);
  return row.text.trim().length >= 5 && (!(required || measure) || !!parseGoalMeasurement(measure));
}

function MeasurementFields({ id, row, set, required }: { id: string; row: Row; set: (patch: Partial<Row>) => void; required: boolean }) {
  const lang = useLang();
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="text-sm font-medium sm:col-span-3" htmlFor={`${id}-measure`}>
        {tr(lang, "en.measure", "Measurement criterion")}
        <input id={`${id}-measure`} className={field} value={row.measure} maxLength={300} required={required} placeholder={tr(lang, "en.measure.example", "Share of users satisfied in a post-service survey")} onChange={(e) => set({ measure: e.target.value })} />
      </label>
      <label className="text-sm font-medium">
        {tr(lang, "en.measure.threshold", "Threshold")}
        <select className={field} value={row.comparison} onChange={(e) => set({ comparison: e.target.value === "at_most" ? "at_most" : "at_least" })}>
          <option value="at_least">{tr(lang, "en.measure.min", "At least")}</option>
          <option value="at_most">{tr(lang, "en.measure.max", "At most")}</option>
        </select>
      </label>
      <label className="text-sm font-medium">
        {tr(lang, "en.measure.value", "Target value")}
        <input type="number" className={field} min={0} max={row.unit.trim() === "%" ? 100 : undefined} step="any" required={required} value={row.value} onChange={(e) => set({ value: e.target.value })} />
      </label>
      <label className="text-sm font-medium">
        {tr(lang, "en.measure.unit", "Unit")}
        <input className={field} maxLength={80} required={required} value={row.unit} placeholder={tr(lang, "en.measure.unit.example", "%, hours, or requests")} onChange={(e) => set({ unit: e.target.value })} />
      </label>
    </div>
  );
}

/** `onSetupPage`: the country step is on the same page, so the blocked box points up to it and a new entity continues to the next step there. */
export function AddEntity({ country, ready, initialOpen = false, onSetupPage = false }: { country: string; ready: boolean; initialOpen?: boolean; onSetupPage?: boolean }) {
  const lang = useLang();
  const router = useRouter();
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [goals, setGoals] = useState<Row[]>([blankGoal]);
  const [created, setCreated] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function add() {
    setBusy(true); setMsg(null);
    const r = await post({ action: "add", country, name, sector, goals: goals.map(goalPayload) });
    setBusy(false);
    if (r.ok) {
      setCreated(name.trim().replace(/\s+/g, " "));
      setMsg({ ok: true, text: tr(lang, "en.saved", "Saved.") });
      setName(""); setSector(""); setGoals([blankGoal]); router.refresh();
    } else setMsg({ ok: false, text: r.error ?? tr(lang, "gt.failed", "The request failed.") });
  }
  if (!ready) return (
    <section className="mt-4 rounded-xl border border-line p-4" data-testid="add-entity">
      <h3 className="font-medium">{tr(lang, "en.add.h", "Add an entity")}</h3>
      <p className="mt-1 text-sm text-ink-soft">{tr(lang, "en.add.blocked", "Set up the country’s rules and build its policy knowledge base before adding an entity.")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className={btnPrimary} disabled>{tr(lang, "en.add.btn", "Add the entity")}</button>
        <Link href={onSetupPage ? "#step-country" : countryHref("/admin/federal/country#manage", country)} className="text-sm underline">{tr(lang, "en.add.setup", "Open country setup")}</Link>
      </div>
    </section>
  );
  return (
    <details open={initialOpen} className="mt-6 rounded-2xl border border-line bg-card p-5" data-testid="add-entity">
      <summary className="cursor-pointer text-base font-medium">{tr(lang, "en.add.h", "Add an entity")}</summary>
      <p className="mt-2 max-w-[68ch] text-sm text-ink-soft">{tr(lang, "en.add.requirements", "Add at least one service goal. For each goal, say how you will measure it and set a numerical target.")}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium" htmlFor="ae-name">{tr(lang, "en.add.name", "Entity name")}</label>
          <input id="ae-name" className={field} value={name} maxLength={120} required onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="ae-sector">{tr(lang, "en.add.sector", "Sector (optional)")}</label>
          <input id="ae-sector" className={field} value={sector} maxLength={80} onChange={(e) => setSector(e.target.value)} />
        </div>
      </div>
      <div className="mt-4 space-y-4">
        {goals.map((goal, i) => {
          const set = (patch: Partial<Row>) => setGoals((rows) => rows.map((row, j) => j === i ? { ...row, ...patch } : row));
          return <fieldset key={i} className="space-y-3 border-t border-line pt-3">
            <legend className="pe-2 text-sm font-medium">{tr(lang, "en.add.service_goal", "Service goal")} {i + 1}</legend>
            <label className="block text-sm font-medium">
              {tr(lang, "en.measure.outcome", "Service outcome")}
              <input className={field} value={goal.text} maxLength={300} required onChange={(e) => set({ text: e.target.value })} />
            </label>
            <MeasurementFields id={`ae-${i}`} row={goal} set={set} required />
            {goals.length > 1 && <button type="button" className="text-sm underline" onClick={() => setGoals((rows) => rows.filter((_, j) => j !== i))}>{tr(lang, "en.goals.remove", "Remove")}</button>}
          </fieldset>;
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {goals.length < MAX_GOALS && <button type="button" className={btnGhost} onClick={() => setGoals((rows) => [...rows, blankGoal])}>{tr(lang, "en.goals.add", "Add a goal")}</button>}
        <button type="button" className={btnPrimary} disabled={busy || name.trim().replace(/\s+/g, " ").length < 3 || goals.some((row) => !validGoal(row, true))} onClick={() => void add()}>{tr(lang, "en.add.btn", "Add the entity")}</button>
        {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-lit-deep" : "text-ember"}`}>{msg.ok ? "✓" : "✕"} {msg.text}</p>}
        {msg?.ok && created && <Link className="text-sm font-medium underline underline-offset-4" href={onSetupPage ? countryHref("/admin/federal/setup#step-cases", country, created) : countryHref("/admin/federal#setup-journey", country, created)}>{tr(lang, "setup.continue", "Continue to use cases")}</Link>}
      </div>
    </details>
  );
}

/** Edit an entity's goals and hide or unhide it. Admin only. */
export function EntityTools({ name, goals, hidden, requireMeasurement = false, initialOpen = false, idSuffix = "" }: { name: string; goals: EntityGoal[]; hidden: boolean; requireMeasurement?: boolean; initialOpen?: boolean; /** Keeps element ids unique when the editor appears twice on a page. */ idSuffix?: string }) {
  const lang = useLang();
  const router = useRouter();
  // The same entity's editor can appear twice on the setup page; each keeps its own rows, so when the goals change
  // underneath (the other editor saved, or a refresh brought new data) the stale rows must not stay editable —
  // a save from them would silently revert the newer goals. Resync during render when the prop signature changes.
  const signature = JSON.stringify(goals);
  const [seen, setSeen] = useState(signature);
  const [rows, setRows] = useState<Row[]>(() => goalRows(goals));
  if (signature !== seen) { setSeen(signature); setRows(goalRows(goals)); }
  const [open, setOpen] = useState(initialOpen);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  async function run(body: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    const r = await post({ ...body, name });
    setBusy(false);
    if (r.ok) {
      if (r.goals) setRows(goalRows(r.goals));
      setMsg({ ok: true, text: tr(lang, "en.saved", "Saved.") });
      router.refresh();
    } else setMsg({ ok: false, text: r.error ?? tr(lang, "gt.failed", "The request failed.") });
  }
  const needsTargets = goals.length === 0 || goals.some((goal) => !goal.measurement);
  const needsMeasurement = (row: Row) => requireMeasurement || !row.id || goals.some((goal) => goal.id === row.id && !!goal.measurement);
  const invalidRows = rows.filter((r) => !validGoal(r, needsMeasurement(r)));
  const id = name.replace(/\W+/g, "-") + idSuffix;
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        {!hidden && <button type="button" className={needsTargets ? btnPrimary : btnGhost} aria-expanded={open} aria-controls={`ge-${id}`} onClick={() => setOpen((o) => !o)}>{
          goals.length === 0 ? tr(lang, "en.goals.backfill", "Add goals and targets")
            : needsTargets ? tr(lang, "en.goals.missing_targets", "Add missing targets")
              : tr(lang, "en.goals.edit_targets", "Edit goals and targets")
        }</button>}
        <button type="button" className={btnGhost} disabled={busy} onClick={() => void run({ action: "set_hidden", hidden: !hidden })}>{hidden ? tr(lang, "en.unhide", "Unhide") : tr(lang, "en.hide", "Hide entity")}</button>
        {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-lit-deep" : "text-ember"}`}>{msg.ok ? "✓" : "✕"} {msg.text}</p>}
      </div>
      {!hidden && (
        <div id={`ge-${id}`} hidden={!open} className="mt-3 rounded-lg bg-paper-deep p-3">
          <p className="mb-3 text-sm text-ink-soft">{tr(lang, "en.goals.measure_hint", "Enter how the service outcome is measured, then set the target value and unit.")}</p>
          <ul className="space-y-3">
            {rows.map((g, i) => (
              <li key={g.id ?? `new-${i}`} className="grid gap-2 sm:grid-cols-[1fr_16rem_auto] sm:items-end">
                <div>
                  <label className="block text-xs font-medium" htmlFor={`g-${id}-t-${i}`}>{tr(lang, "en.goals.text", "Goal")} {i + 1}{g.id && <> <bdi dir="ltr" className="font-mono text-ink-soft">{g.id}</bdi></>}</label>
                  <input id={`g-${id}-t-${i}`} className={field} value={g.text} maxLength={300} onChange={(e) => set(i, { text: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium" htmlFor={`g-${id}-c-${i}`}>{tr(lang, "en.goals.test", "Prism test (optional)")}</label>
                  <select id={`g-${id}-c-${i}`} className={field} value={g.criterion} onChange={(e) => set(i, { criterion: e.target.value })}>
                    <option value="">{tr(lang, "en.goals.outcome", "An outcome, measured after go-live")}</option>
                    {GOAL_CRITERIA.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <button type="button" className="mb-2 text-xs underline" disabled={rows.length < 2} onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>{tr(lang, "en.goals.remove", "Remove")}</button>
                <div className="sm:col-span-3"><MeasurementFields id={`g-${id}-${i}`} row={g} set={(patch) => set(i, patch)} required={needsMeasurement(g)} /></div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            {rows.length < MAX_GOALS && <button type="button" className={btnGhost} onClick={() => setRows((r) => [...r, blankGoal])}>{tr(lang, "en.goals.add", "Add a goal")}</button>}
            <button type="button" className={btnPrimary} disabled={busy || invalidRows.length > 0} onClick={() => void run({ action: "set_goals", goals: rows.map(goalPayload) })}>{tr(lang, "en.goals.save_targets", "Save goals and targets")}</button>
            {invalidRows.length > 0 && <p className="w-full text-xs text-ink-soft">{tr(lang, "en.goals.invalid", "Each goal needs its outcome text, and a measurement criterion of at least 5 characters, a numeric target and a unit (a % target is at most 100).")}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
