"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { MAX_TEXT, MIN_PLAN, MIN_REASON } from "@/lib/un/sop/change";
import { MAX_PROFILES } from "@/lib/un/sop/custom-limits";
import type { SopChanges } from "@/lib/un/sop/versions";
import { useLang } from "../../../_components/Lang";
import { btnGhost, btnPrimary, field } from "../../../_components/ui";
import { fill } from "../../../_components/labels";

async function post(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; j?: Record<string, unknown> }> {
  try {
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: r.ok, error: j.error as string | undefined, j };
  } catch { return { ok: false, error: "The request failed." }; }
}

type P = { name: string; tasks: string[] };
export interface OpenRequest { by: string; at: string; reason: string; plan: string; from: number; to: number }

/** The SOP of a use case, by version.
 *  - Every change to the SOP (new text, or an edit of a job profile) is a NEW VERSION. A use case that is not deployed moves to it at once and is rerun.
 *  - A DEPLOYED use case is frozen on the version it has. Its business process owner asks to move it, with a reason and a plan; an admin applies or declines.
 * An admin sees publishing and the profile editor; a process owner sees the request form; a viewer sees the version and what changed. */
export function SopEditor({ ucId, attached, version, latest, frozen, changes, openRequest, canEdit, canRequest, canApply, profiles }: {
  ucId: string; attached: string | null; version: number | null; latest: number | null; frozen: boolean; changes: SopChanges | null;
  openRequest: OpenRequest | null; canEdit: boolean; canRequest: boolean; canApply: boolean; profiles: P[];
}) {
  const lang = useLang();
  const router = useRouter();
  const profilesUrl = `/api/admin/un/use-cases/${ucId}/profiles`;
  const changeUrl = `/api/admin/un/use-cases/${ucId}/sop-change`;
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [vtext, setVtext] = useState("");
  const [reason, setReason] = useState("");
  const [plan, setPlan] = useState("");
  const [note, setNote] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { name: string; tasks: string }>>({});
  const [add, setAdd] = useState({ name: "", tasks: "" });
  async function run(key: string, path: string, body: Record<string, unknown>, after?: (j: Record<string, unknown>) => string | void) {
    setBusy(key); setMsg(null);
    const r = await post(path, body);
    setBusy(null);
    if (r.ok) { const t = after?.(r.j ?? {}); setMsg({ ok: true, text: t || tr(lang, "en.saved", "Saved.") }); router.refresh(); } else setMsg({ ok: false, text: r.error ?? tr(lang, "gt.failed", "The request failed.") });
  }
  const rolled = (j: Record<string, unknown>) => {
    const ro = j.rollout as { moved: { ext_id: string; rerun: boolean }[]; frozen: string[] } | undefined;
    if (!ro) return fill(tr(lang, "sv.published", "Version {v} published."), { v: String(j.version ?? "") });
    return fill(tr(lang, "sv.published.n", "Version {v} published. {m} use cases moved to it ({r} rerun); {f} deployed use cases stay on their version."), { v: String(j.version), m: String(ro.moved.length), r: String(ro.moved.filter((x) => x.rerun).length), f: String(ro.frozen.length) });
  };
  const behind = version !== null && latest !== null && latest > version;
  const draft = (p: P) => drafts[p.name] ?? { name: p.name, tasks: p.tasks.join("\n") };
  const chips = (label: string, names: string[]) => (names.length ? <li><span className="font-medium">{label}:</span> <bdi dir="auto">{names.join(", ")}</bdi></li> : null);
  const summary = changes && (
    <ul className="mt-2 space-y-1 text-xs">
      {chips(tr(lang, "sv.added", "Job profiles added"), changes.profiles.added)}
      {chips(tr(lang, "sv.changed", "Job profiles changed"), changes.profiles.changed)}
      {chips(tr(lang, "sv.removed", "Job profiles removed"), changes.profiles.removed)}
      {chips(tr(lang, "sv.kept", "Kept as they were"), changes.profiles.unchanged)}
      {(changes.lines.added.length > 0 || changes.lines.removed.length > 0) && (
        <li>
          {fill(tr(lang, "sv.lines", "{a} lines added and {r} removed in the text"), { a: String(changes.lines.added.length), r: String(changes.lines.removed.length) })}{changes.lines.more ? ` (+${changes.lines.more})` : ""}
          <details className="mt-1">
            <summary className="w-fit cursor-pointer underline underline-offset-2">{tr(lang, "sv.lines.show", "Show the changed lines")}</summary>
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              {([[tr(lang, "sv.lines.removed", "Removed"), changes.lines.removed], [tr(lang, "sv.lines.added", "Added"), changes.lines.added]] as const).map(([label, lines]) => (
                <div key={label}>
                  <p className="font-medium">{label}</p>
                  <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto">{lines.map((l, i) => <li key={i} dir="auto" className="rounded bg-card p-1.5 font-mono text-[11px] break-words">{l}</li>)}</ul>
                </div>
              ))}
            </div>
          </details>
        </li>
      )}
    </ul>
  );

  return (
    <div className="mt-4 space-y-4" data-testid="sop-editor">
      {attached && version !== null && (
        <div className="rounded-xl border border-line p-4" data-testid="sop-version">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {fill(tr(lang, "sv.on", "On version {v} of {sop}"), { v: String(version), sop: attached })}
            {frozen && <span className="rounded-full border border-ink px-2 py-0.5 font-mono text-[10px] tracking-wide uppercase">{tr(lang, "sv.frozen", "Frozen: in production")}</span>}
            {!behind && <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] tracking-wide text-ink-soft uppercase">{tr(lang, "sv.latest", "Latest version")}</span>}
          </p>
          {frozen && <p className="mt-1 max-w-[68ch] text-sm text-ink-soft">{tr(lang, "sv.frozen.h", "This use case is deployed, so its SOP and job profiles are frozen. A new version does not reach it by itself: its business process owner asks for the change, with a reason and a plan, and an admin applies it.")}</p>}
          {behind && (
            <div className="mt-3 rounded-lg bg-paper-deep p-3">
              <p className="text-sm font-medium">{fill(tr(lang, "sv.newer", "Version {v} is available"), { v: String(latest) })}</p>
              {summary}
            </div>
          )}
          {behind && frozen && !openRequest && canRequest && (
            <div className="mt-3">
              <p className="text-sm font-medium">{tr(lang, "sv.req.h", "Ask to move this use case to the new version")}</p>
              <label className="mt-2 block text-xs font-medium" htmlFor="sv-reason">{tr(lang, "sv.req.reason", "Why is the change needed?")}</label>
              <textarea id="sv-reason" className={`${field} h-20 text-sm`} value={reason} maxLength={MAX_TEXT} onChange={(e) => setReason(e.target.value)} />
              <label className="mt-2 block text-xs font-medium" htmlFor="sv-plan">{tr(lang, "sv.req.plan", "Plan for the change: what will be checked, in what order, and how it can be undone")}</label>
              <textarea id="sv-plan" className={`${field} h-28 text-sm`} value={plan} maxLength={MAX_TEXT} onChange={(e) => setPlan(e.target.value)} />
              <button type="button" className={`${btnPrimary} mt-2`} disabled={!!busy || reason.trim().length < MIN_REASON || plan.trim().length < MIN_PLAN} onClick={() => void run("req", changeUrl, { action: "request", reason, plan }, () => { setReason(""); setPlan(""); return tr(lang, "sv.req.sent", "Request sent. An admin can now apply it."); })}>{tr(lang, "sv.req.send", "Send the request")}</button>
            </div>
          )}
          {behind && frozen && !openRequest && !canRequest && <p className="mt-3 text-xs text-ink-soft">{tr(lang, "sv.req.wait", "Waiting for a change request from the business process owner.")}</p>}
          {openRequest && (
            <div className="mt-3 rounded-lg border border-line p-3" data-testid="sop-change-request">
              <p className="text-sm font-medium">{fill(tr(lang, "sv.open", "Change requested: version {a} to version {b}"), { a: String(openRequest.from), b: String(openRequest.to) })}</p>
              <p className="mt-1 text-xs text-ink-soft">{fill(tr(lang, "sv.open.by", "Requested by {who} on {date}"), { who: openRequest.by, date: openRequest.at.slice(0, 10) })}</p>
              <p className="mt-2 text-xs font-medium">{tr(lang, "sv.req.reason.l", "Reason")}</p>
              <p className="whitespace-pre-wrap text-sm" dir="auto">{openRequest.reason}</p>
              <p className="mt-2 text-xs font-medium">{tr(lang, "sv.req.plan.l", "Plan")}</p>
              <p className="whitespace-pre-wrap text-sm" dir="auto">{openRequest.plan}</p>
              {canApply ? (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <button type="button" className={btnPrimary} disabled={!!busy} onClick={() => void run("apply", changeUrl, { action: "apply" }, (j) => fill(tr(lang, "sv.applied", "Moved to version {v}; the use case was rerun."), { v: String(j.version) }))}>{tr(lang, "sv.apply", "Apply the change and rerun")}</button>
                  <label className="sr-only" htmlFor="sv-note">{tr(lang, "sv.note", "Note on declining")}</label>
                  <input id="sv-note" className={`${field} mt-0 w-56 py-1.5 text-sm`} value={note} maxLength={500} placeholder={tr(lang, "sv.note", "Note on declining")} onChange={(e) => setNote(e.target.value)} />
                  <button type="button" className={btnGhost} disabled={!!busy} onClick={() => void run("decline", changeUrl, { action: "decline", note }, () => tr(lang, "sv.declined", "Declined. The use case stays on its version."))}>{tr(lang, "sv.decline", "Decline")}</button>
                </div>
              ) : <p className="mt-2 text-xs text-ink-soft">{tr(lang, "sv.open.wait", "Waiting for an admin to apply or decline it.")}</p>}
            </div>
          )}
        </div>
      )}

      {canEdit && attached && (
        <details className="rounded-xl border border-line p-4">
          <summary className="cursor-pointer text-sm font-medium">{tr(lang, "sv.pub.h", "Publish a new version of this SOP")}</summary>
          <p className="mt-2 max-w-[68ch] text-sm text-ink-soft">{tr(lang, "sv.pub.lede", "Paste the updated SOP. It is compared with the last version and only the job profiles it affects are derived again: new ones are added, changed ones updated, ones the text no longer has removed. Every use case on this SOP that is not deployed moves to it now and is rerun. Deployed use cases stay on their version until their process owner asks to move.")}</p>
          <label className="mt-3 block text-sm font-medium" htmlFor="sv-text">{tr(lang, "sp.text", "SOP text (Markdown)")}</label>
          <textarea id="sv-text" className={`${field} h-44 font-mono text-xs`} value={vtext} onChange={(e) => setVtext(e.target.value)} />
          <button type="button" className={`${btnPrimary} mt-3`} disabled={!!busy || vtext.trim().length < 50} onClick={() => void run("ver", profilesUrl, { action: "new_version", text: vtext }, (j) => { setVtext(""); return rolled(j); })}>{tr(lang, "sv.pub.btn", "Publish the new version")}</button>
        </details>
      )}

      {canEdit && !frozen && (
        <details className="rounded-xl border border-line p-4">
          <summary className="cursor-pointer text-sm font-medium">{tr(lang, "sp.paste.h", "Use your own SOP")}</summary>
          <p className="mt-2 max-w-[68ch] text-sm text-ink-soft">{tr(lang, "sp.paste.lede", "Paste the SOP. Its job profiles are worked out from the steps that say who does the work, and it replaces the attached SOP for this use case. Ticks made under the earlier SOP are kept in its history, so choose again which profiles to automate and run the verdict again.")}</p>
          <div className="mt-3 grid gap-2">
            <label className="block text-sm font-medium" htmlFor="sp-title">{tr(lang, "sp.title", "SOP title")}</label>
            <input id="sp-title" className={field} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
            <label className="block text-sm font-medium" htmlFor="sp-text">{tr(lang, "sp.text", "SOP text (Markdown)")}</label>
            <textarea id="sp-text" className={`${field} h-44 font-mono text-xs`} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <button type="button" className={`${btnPrimary} mt-3`} disabled={!!busy || text.trim().length < 50} onClick={() => void run("paste", profilesUrl, { action: "attach_custom", title, text }, (j) => { setTitle(""); setText(""); if (j.needs_structuring) return j.drafted ? "This SOP needs structuring, so it is not attached yet. A draft is ready: review it in the Structure the SOP section below." : "Attached as it is. It needs structuring and a draft could not be made: use the Structure the SOP section below."; })}>{busy === "paste" ? "Analysing the SOP…" : tr(lang, "sp.paste.btn", "Use this SOP")}</button>
          {busy === "paste" && <div className="mt-2"><div role="progressbar" aria-label="Analysing the SOP" className="h-2 w-64 overflow-hidden rounded-full bg-track"><div className="h-full w-1/3 animate-pulse rounded-full bg-lit motion-reduce:animate-none" /></div><p className="mt-1 text-xs text-ink-soft">The SOP is analysed first. If it needs structuring, a model drafts it, which can take a minute.</p></div>}
        </details>
      )}

      {canEdit && attached && !frozen && (
        <section className="rounded-xl border border-line p-4" aria-labelledby="sp-prof-h">
          <h3 id="sp-prof-h" className="text-sm font-medium">{tr(lang, "sp.prof.h", "Edit the job profiles")}</h3>
          <p className="mt-1 max-w-[68ch] text-sm text-ink-soft">{tr(lang, "sv.prof.lede", "One task per line. Saving makes a new version of the SOP: use cases that are not deployed move to it and are rerun, and deployed ones stay as they are. A task's risk flags are worked out again from its wording. Renaming a profile moves its Automate tick; removing one removes the tick.")}</p>
          <ul className="mt-3 space-y-4">
            {profiles.map((p, i) => {
              const d = draft(p);
              const dirty = d.name.trim() !== p.name || d.tasks.trim() !== p.tasks.join("\n").trim();
              return (
                <li key={p.name} className="rounded-lg bg-paper-deep p-3">
                  <label className="block text-xs font-medium" htmlFor={`sp-n-${i}`}>{tr(lang, "sp.prof.name", "Job profile")}</label>
                  <input id={`sp-n-${i}`} className={field} value={d.name} maxLength={80} onChange={(e) => setDrafts({ ...drafts, [p.name]: { ...d, name: e.target.value } })} />
                  <label className="mt-2 block text-xs font-medium" htmlFor={`sp-t-${i}`}>{tr(lang, "sp.prof.tasks", "Tasks (one per line)")}</label>
                  <textarea id={`sp-t-${i}`} className={`${field} h-24 text-xs`} value={d.tasks} onChange={(e) => setDrafts({ ...drafts, [p.name]: { ...d, tasks: e.target.value } })} />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className={btnPrimary} disabled={!!busy || !dirty} onClick={() => void run(`u-${p.name}`, profilesUrl, { action: "profile", op: "update", name: p.name, new_name: d.name, tasks: d.tasks }, (j) => { setDrafts((x) => { const { [p.name]: _gone, ...rest } = x; void _gone; return rest; }); return rolled(j); })}>{tr(lang, "sp.prof.save", "Save profile")}</button>
                    <button type="button" className={btnGhost} disabled={!!busy || profiles.length < 2} title={profiles.length < 2 ? tr(lang, "sp.prof.last", "The last job profile cannot be removed.") : undefined} aria-label={fill(tr(lang, "sp.prof.remove.a", "Remove the job profile {n}"), { n: p.name })} onClick={() => { if (confirm(fill(tr(lang, "sp.prof.remove.q", "Remove the job profile {n}? Its Automate tick is removed too."), { n: p.name }))) void run(`r-${p.name}`, profilesUrl, { action: "profile", op: "remove", name: p.name }, rolled); }}>{tr(lang, "sp.prof.remove", "Remove")}</button>
                  </div>
                </li>
              );
            })}
          </ul>
          {profiles.length < MAX_PROFILES && (
            <div className="mt-4 rounded-lg border border-dashed border-line p-3">
              <p className="text-xs font-medium">{tr(lang, "sp.prof.add", "Add a job profile")}</p>
              <label className="mt-2 block text-xs font-medium" htmlFor="sp-an">{tr(lang, "sp.prof.name", "Job profile")}</label>
              <input id="sp-an" className={field} value={add.name} maxLength={80} onChange={(e) => setAdd({ ...add, name: e.target.value })} />
              <label className="mt-2 block text-xs font-medium" htmlFor="sp-at">{tr(lang, "sp.prof.tasks", "Tasks (one per line)")}</label>
              <textarea id="sp-at" className={`${field} h-20 text-xs`} value={add.tasks} onChange={(e) => setAdd({ ...add, tasks: e.target.value })} />
              <button type="button" className={`${btnPrimary} mt-2`} disabled={!!busy || add.name.trim().length < 2 || !add.tasks.trim()} onClick={() => void run("add", profilesUrl, { action: "profile", op: "add", name: add.name, tasks: add.tasks }, (j) => { setAdd({ name: "", tasks: "" }); return rolled(j); })}>{tr(lang, "sp.prof.add.btn", "Add the profile")}</button>
            </div>
          )}
        </section>
      )}
      {canEdit && frozen && <p className="text-xs text-ink-soft">{tr(lang, "sv.prof.frozen", "The job profiles of a deployed use case cannot be edited here: they move with the SOP version, through a change request.")}</p>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-lit-deep" : "text-ember"}`}>{msg.ok ? "✓" : "✕"} {msg.text}</p>}
    </div>
  );
}
