"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { THRESHOLD_RANGE, type AutoState, type CycleRecord } from "@/lib/un/auto-tune";
import { useLang } from "../../../_components/Lang";
import { btnGhost, btnPrimary, card, field } from "../../../_components/ui";

export interface Waiting { id: string; summary: string; by: string; at: string; held_out_before: number | null; held_out_after: number | null }
const pc = (v: number | null) => (v === null ? "–" : `${(v * 100).toFixed(1)}%`);

/** The tuning agent for one use case: the owner's switch and limit, a button that runs one cycle, what it did, and the changes that wait for a
 * person. The server enforces every permission; the buttons only hide what the person may not do. */
export function ImproveControls({ useCaseId, state, waiting, mayRun, maySwitch, mayDecide, modelCallsToday, cyclesLeft }: {
  useCaseId: string; state: AutoState; waiting: Waiting[]; mayRun: boolean; maySwitch: boolean; mayDecide: boolean; modelCallsToday: number; cyclesLeft: number;
}) {
  const lang = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<CycleRecord | null>(null);
  const [limit, setLimit] = useState(String(Math.round(state.threshold * 100)));
  const [why, setWhy] = useState<Record<string, string>>({});
  const send = async (body: object) => {
    setBusy(true); setError(null);
    const res = await fetch(`/api/admin/un/use-cases/${useCaseId}/autotune`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = (await res.json().catch(() => ({}))) as { error?: string; record?: CycleRecord };
    setBusy(false);
    if (!res.ok) { setError(d.error ?? tr(lang, "tg2.failed", "The request failed.")); return; }
    if (d.record) setLast(d.record);
    router.refresh();
  };
  const stopText = (s: CycleRecord["stop"]) => ({ no_misses: tr(lang, "im.stop.nomiss", "nothing was wrong on the tuning questions"), done: tr(lang, "im.stop.done", "no further safe fix"), threshold_reached: tr(lang, "im.stop.limit", "held-out alignment reached the limit: the rest waits for a person"), budget: tr(lang, "im.stop.budget", "the cycle's limit on candidates was reached"), stalled: tr(lang, "im.stop.stalled", "stalled"), off: tr(lang, "im.stop.off", "switched off"), error: tr(lang, "im.stop.error", "stopped with an error") })[s];
  const cycles = [...(last && !state.cycles.some((c) => c.at === last.at) ? [last] : []), ...[...state.cycles].reverse()].slice(0, 6);

  return (
    <>
      <section className={`${card} mt-6`} aria-labelledby="im-sw">
        <h2 id="im-sw" className="font-display text-xl font-medium">{tr(lang, "im.sw", "Automatic changes")}</h2>
        <p className="mt-1 max-w-[68ch] text-sm text-ink-soft">{tr(lang, "im.sw.lede", "The tuning agent finds what the agent gets wrong on the tuning questions and proposes small fixes. Switched on, it applies the low-risk ones by itself while held-out alignment is below the limit, and only if nothing gets worse. Everything else waits for a person.")}</p>
        <p className="mt-2 text-sm font-medium" role="status">{state.enabled ? tr(lang, "im.is.on", "Switched on") : tr(lang, "im.is.off", "Switched off")}{state.switched_by ? ` · ${state.switched_by}` : ""} · {tr(lang, "im.limit", "limit")} {Math.round(state.threshold * 100)}%</p>
        {maySwitch ? (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <button type="button" className={btnPrimary} disabled={busy} onClick={() => send({ action: "switch", on: !state.enabled })}>{state.enabled ? tr(lang, "im.off", "Switch off") : tr(lang, "im.on", "Switch on")}</button>
            <div>
              <label className="block text-sm" htmlFor="im-limit">{tr(lang, "im.limit.l", "Limit (held-out alignment, %)")}</label>
              <select id="im-limit" className={field} value={limit} onChange={(e) => setLimit(e.target.value)}>
                {Array.from({ length: Math.round((THRESHOLD_RANGE.max - THRESHOLD_RANGE.min) * 100) + 1 }, (_, i) => String(Math.round(THRESHOLD_RANGE.min * 100) + i)).map((v) => <option key={v} value={v}>{v}%</option>)}
              </select>
            </div>
            <button type="button" className={btnGhost} disabled={busy || Number(limit) === Math.round(state.threshold * 100)} onClick={() => send({ action: "threshold", value: Number(limit) / 100 })}>{tr(lang, "im.limit.set", "Set the limit")}</button>
          </div>
        ) : <p className="mt-2 text-sm font-medium">{tr(lang, "im.sw.ro", "Only the business process owner switches automatic changes on or off and sets the limit.")}</p>}
      </section>

      <section className={`${card} mt-6`} aria-labelledby="im-run">
        <h2 id="im-run" className="font-display text-xl font-medium">{tr(lang, "im.run", "Run a tuning cycle")}</h2>
        <p className="mt-1 text-sm text-ink-soft">{tr(lang, "im.run.lede", "One pass: score the agent, try the candidate fixes, and apply, propose or discard each. It is bounded: a few passes a day and a cap on model calls.")} ({cyclesLeft} {tr(lang, "im.run.left", "cycles left today")}, {modelCallsToday} {tr(lang, "im.run.calls", "model calls used today")})</p>
        {mayRun ? <button type="button" className={`${btnPrimary} mt-3`} disabled={busy || !!state.running || cyclesLeft <= 0} onClick={() => send({ action: "run" })}>{busy || state.running ? tr(lang, "im.running", "Tuning…") : tr(lang, "im.go", "Run a cycle now")}</button> : <p className="mt-2 text-sm font-medium">{tr(lang, "im.run.ro", "Running a cycle needs the operator or the business process owner of this use case.")}</p>}
        {error && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--color-v-nogo)" }}>{error}</p>}
      </section>

      <section className={`${card} mt-6`} aria-labelledby="im-wait">
        <h2 id="im-wait" className="font-display text-xl font-medium">{tr(lang, "im.wait", "Waiting for a person")} ({waiting.length})</h2>
        <p className="mt-1 text-sm text-ink-soft">{tr(lang, "im.wait.lede", "Changes the agent proposed but may not apply by itself: it touches a control or what a citizen reads, auto-tuning is off, or held-out alignment is already at the limit. Each shows how held-out alignment would move.")}</p>
        {waiting.length === 0 ? <p className="mt-2 text-sm text-ink-soft">{tr(lang, "im.wait.none", "Nothing is waiting.")}</p> : (
          <ul className="mt-3 space-y-2">
            {waiting.map((w) => (
              <li key={w.id} className="rounded-xl border border-line p-3 text-sm">
                <p>{w.summary}</p>
                <p className="mt-1 text-xs text-ink-soft">{tr(lang, "im.ho", "Held-out alignment")} {pc(w.held_out_before)} → {pc(w.held_out_after)} · {w.by}</p>
                {mayDecide ? (
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <button type="button" className={btnPrimary} disabled={busy} onClick={() => send({ action: "decide", id: w.id, decision: "approve" })}>{tr(lang, "im.approve", "Approve")}</button>
                    <label className="sr-only" htmlFor={`im-why-${w.id}`}>{tr(lang, "im.why", "Reason for rejecting")}</label>
                    <input id={`im-why-${w.id}`} className={`${field} max-w-xs`} placeholder={tr(lang, "im.why", "Reason for rejecting")} value={why[w.id] ?? ""} onChange={(e) => setWhy({ ...why, [w.id]: e.target.value })} maxLength={500} />
                    <button type="button" className={btnGhost} disabled={busy || (why[w.id] ?? "").trim().length < 3} onClick={() => send({ action: "decide", id: w.id, decision: "reject", comment: why[w.id] })}>{tr(lang, "im.reject", "Reject")}</button>
                  </div>
                ) : <p className="mt-1 text-xs font-medium">{tr(lang, "im.decide.ro", "Only the business process owner decides.")}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${card} mt-6`} aria-labelledby="im-hist">
        <h2 id="im-hist" className="font-display text-xl font-medium">{tr(lang, "im.hist", "What the agent did")}</h2>
        {cycles.length === 0 ? <p className="mt-2 text-sm text-ink-soft">{tr(lang, "im.hist.none", "No tuning cycle has run yet.")}</p> : (
          <ul className="mt-3 space-y-3">
            {cycles.map((c) => (
              <li key={c.at} className="rounded-xl border border-line p-3 text-sm">
                <p className="font-medium">{new Date(c.at).toLocaleString("en-GB", { timeZone: "Asia/Dubai" })} · {c.mode === "auto" ? tr(lang, "im.mode.auto", "automatic") : tr(lang, "im.mode.prop", "propose only")} · {c.by}</p>
                <p className="mt-1 text-xs text-ink-soft">{tr(lang, "im.ho", "Held-out alignment")} {pc(c.held_out_before)} → {pc(c.held_out_after)} · {stopText(c.stop)}{c.model_calls ? ` · ${c.model_calls} ${tr(lang, "im.calls", "model calls")}` : ""}{c.error ? ` · ${c.error}` : ""}</p>
                {c.applied.length > 0 && <><p className="mt-2 text-xs font-medium">{tr(lang, "im.applied", "Applied by the agent")}</p><ul className="list-disc ps-5 text-xs">{c.applied.map((a) => <li key={a.id}>{a.summary}</li>)}</ul></>}
                {c.proposed.length > 0 && <><p className="mt-2 text-xs font-medium">{tr(lang, "im.proposed", "Proposed, waiting for a person")}</p><ul className="list-disc ps-5 text-xs">{c.proposed.map((a) => <li key={a.id}>{a.summary}: {a.why}</li>)}</ul></>}
                {c.discarded.length > 0 && <><p className="mt-2 text-xs font-medium">{tr(lang, "im.discarded", "Discarded")} ({c.discarded.length})</p><ul className="list-disc ps-5 text-xs text-ink-soft">{c.discarded.slice(0, 4).map((a, i) => <li key={i}>{a.summary}: {a.reason}</li>)}</ul></>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
