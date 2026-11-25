"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { MAX_REASON, MIN_REASON, type RerunButton } from "@/lib/un/rerun";
import { useLang } from "./Lang";
import Pop from "./Pop";
import { btnPrimary, field } from "./ui";
import { fill } from "./labels";

export interface RerunUi {
  button: RerunButton;
  /** Rules or SOP changed since the last run: the use case is out of date, nothing has been rerun. */
  stale: boolean;
  canRun: boolean;
  canRequest: boolean;
  request: { by: string; at: string; reason: string } | null;
}

async function post(ucId: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`/api/admin/un/use-cases/${ucId}/rerun`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    return { ok: r.ok, error: j.error };
  } catch { return { ok: false, error: "The request failed." }; }
}

const Icon = ({ spin }: { spin?: boolean }) => (
  <svg aria-hidden viewBox="0 0 24 24" className={`h-4 w-4 ${spin ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v4.5h-4.5" /></svg>
);
const btn = "relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink-soft hover:border-ink-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-line disabled:hover:text-ink-soft";

/** The rerun icon of a use case row. Four states, always with a title and a spoken label, never colour alone:
 *  ready (rerun now), needs a request (deployed: the business process owner asks, with a reason), requested (an admin reviews it and reruns), nothing to repeat.
 *  A small dot marks a use case whose rules or SOP changed since its last run. Nothing here runs by itself. */
export function RerunControl({ ucId, ext, ui }: { ucId: string; ext: string; ui: RerunUi }) {
  const lang = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [reason, setReason] = useState("");
  const staleNote = ui.stale ? ` ${tr(lang, "rr.stale", "Rules or SOP changed since the last run.")}` : "";
  const dot = ui.stale ? <span aria-hidden className="absolute -end-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-card bg-ember" /> : null;
  const lock = <svg aria-hidden viewBox="0 0 24 24" className="absolute -end-1 -bottom-1 h-3.5 w-3.5 rounded-full bg-card p-px text-ink" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
  const label = (t: string) => `${fill(tr(lang, "rr.for", "Rerun {id}"), { id: ext })}: ${t}${staleNote}`;

  async function run() {
    setBusy(true); setMsg(null);
    const r = await post(ucId, { action: "run" });
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, text: tr(lang, "rr.done", "A new run was made. Sign it on the use case page to accept it.") }); router.refresh(); } else setMsg({ ok: false, text: r.error ?? tr(lang, "gt.failed", "The request failed.") });
  }
  async function send() {
    setBusy(true); setMsg(null);
    const r = await post(ucId, { action: "request", reason });
    setBusy(false);
    if (r.ok) { setReason(""); setMsg({ ok: true, text: tr(lang, "rr.sent", "Request sent. An admin can now rerun this use case.") }); router.refresh(); } else setMsg({ ok: false, text: r.error ?? tr(lang, "gt.failed", "The request failed.") });
  }
  const status = msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-xs ${msg.ok ? "text-lit-deep" : "text-ember"}`}>{msg.ok ? "✓" : "✕"} {msg.text}</p>;

  if (ui.button === "no_run") {
    const t = tr(lang, "rr.norun", "No earlier run to repeat. Run a scenario first.");
    return <button type="button" disabled className={btn} title={t} aria-label={label(t)}><Icon />{dot}</button>;
  }
  if (ui.button === "ready") {
    if (!ui.canRun) { const t = tr(lang, "rr.noperm", "Rerunning needs an admin."); return <button type="button" disabled className={btn} title={t} aria-label={label(t)}><Icon />{dot}</button>; }
    const t = tr(lang, "rr.ready", "Rerun this use case under today's rules and SOP");
    return (
      <span className="inline-flex flex-col items-center">
        <button type="button" className={btn} disabled={busy} title={`${t}${staleNote}`} aria-label={label(t)} onClick={() => void run()}><Icon spin={busy} />{dot}</button>
        {msg && <span className="sr-only" role={msg.ok ? "status" : "alert"}>{msg.text}</span>}
      </span>
    );
  }
  if (ui.button === "needs_request") {
    if (!ui.canRequest) { const t = tr(lang, "rr.needs.wait", "Deployed: waiting for a rerun request from the business process owner."); return <button type="button" disabled className={btn} title={t} aria-label={label(t)}><Icon />{lock}{dot}</button>; }
    const t = tr(lang, "rr.needs", "Deployed: a rerun needs a request from the business process owner, with a reason.");
    return (
      <Pop buttonClass={btn} panelClass="w-[min(24rem,calc(100vw-2rem))]" label={<><span className="sr-only">{label(t)}</span><Icon />{lock}{dot}</>}>
        <p className="font-display text-lg font-medium">{tr(lang, "rr.form.h", "Request a rerun")} <bdi dir="ltr" className="font-mono text-sm text-ink-soft">{ext}</bdi></p>
        <p className="mt-1 text-sm text-ink-soft">{t}{staleNote}</p>
        <label className="mt-3 block text-sm font-medium" htmlFor={`rr-${ucId}`}>{tr(lang, "rr.form.reason", "Why is a rerun needed?")}</label>
        <textarea id={`rr-${ucId}`} className={`${field} h-24 text-sm`} value={reason} maxLength={MAX_REASON} onChange={(e) => setReason(e.target.value)} />
        <button type="button" className={`${btnPrimary} mt-3`} disabled={busy || reason.trim().length < MIN_REASON} onClick={() => void send()}>{tr(lang, "rr.form.send", "Send the request")}</button>
        {status}
      </Pop>
    );
  }
  // requested
  const q = ui.request;
  const t = tr(lang, "rr.requested", "Rerun requested: open to review it and rerun");
  return (
    <Pop buttonClass={`${btn} text-lit-deep`} panelClass="w-[min(24rem,calc(100vw-2rem))]" label={<><span className="sr-only">{label(t)}</span><Icon /><span aria-hidden className="absolute -end-1 -bottom-1 h-3 w-3 rounded-full border border-card bg-lit" />{dot}</>}>
      <p className="font-display text-lg font-medium">{tr(lang, "rr.requested", "Rerun requested: open to review it and rerun")} <bdi dir="ltr" className="font-mono text-sm text-ink-soft">{ext}</bdi></p>
      {q && <>
        <p className="mt-1 text-xs text-ink-soft">{fill(tr(lang, "rr.req.by", "Requested by {who} on {date}"), { who: q.by, date: q.at.slice(0, 10) })}</p>
        <p className="mt-2 text-xs font-medium">{tr(lang, "rr.req.reason", "Reason")}</p>
        <p className="mt-0.5 text-sm" dir="auto">{q.reason}</p>
      </>}
      {staleNote && <p className="mt-2 text-xs text-ink-soft">{staleNote.trim()}</p>}
      {ui.canRun
        ? <button type="button" className={`${btnPrimary} mt-3`} disabled={busy} onClick={() => void run()}>{busy ? tr(lang, "rr.running", "Running…") : tr(lang, "rr.run", "Rerun now")}</button>
        : <p className="mt-3 text-xs text-ink-soft">{tr(lang, "rr.noperm", "Rerunning needs an admin.")}</p>}
      {status}
    </Pop>
  );
}
