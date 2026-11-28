"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GateLine } from "@/lib/un/evidence-scenario";
import type { Verdict } from "@/lib/un/model";
import { btnGhost, btnPrimary, card, field, STATUS_META, VerdictBadge } from "../../_components/ui";

// The verdict path of any use case: the owner of each gate records its evidence, the rules give the verdict, and a person signs it. Everything is recorded in the
// same hash-chained run the staged scenarios use. Read-only for a person who may not edit.

interface RunView { id: string; requested: string | null; steps: number; verdict: { verdict: Verdict; reasons: string[] } | null; signed: { decision: string; by: string; at: string; comment: string } | null }
const LEVEL_EN: Record<string, string> = { ASSISTANT_ONLY: "Assistant only (a person does the work)", GO_SUPERVISED: "Supervised (a person releases each result)", GO_AUTONOMOUS: "Autonomous" };
const OWNER_EN: Record<string, string> = { innovator: "Innovator", policy_adviser: "Policy adviser", security: "Security", privacy: "Privacy", compliance: "Compliance", frontline: "Frontline", finance: "Finance" };

async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as { error?: string };
  return { ok: r.ok, error: j.error };
}

function Row({ line, useCaseId, canEdit, open }: { line: GateLine; useCaseId: string; canEdit: boolean; open: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<"pass" | "fail">(line.status === "fail" ? "fail" : "pass");
  const [note, setNote] = useState("");
  const [change, setChange] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const m = STATUS_META[line.status];
  // a gate that fails is lifted in two steps: its fix is declared with the change that made it, then its owner re-tests
  const fixing = line.status === "fail";
  const retest = line.status === "fix_declared";
  async function record() {
    setBusy(true); setErr("");
    const r = await post(`/api/admin/un/use-cases/${useCaseId}/evidence`, fixing ? { action: "record", gate: line.id, status: "fix_declared", note, change } : { action: "record", gate: line.id, status, note });
    setBusy(false);
    if (r.ok) { setNote(""); setChange(""); router.refresh(); } else setErr(r.error ?? "The request failed.");
  }
  const noteId = `ev-note-${line.id}`;
  return (
    <li className="border-t border-line py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{line.label} <span className="font-normal text-ink-soft">· {OWNER_EN[line.owner] ?? line.owner}</span></p>
        <p className="text-sm" style={{ color: line.status === "unknown" ? "var(--color-ember, #b4421f)" : undefined }}>
          <span aria-hidden style={{ color: m.color }}>{m.glyph}</span>{" "}
          {line.kind === "waived" ? "Waived" : line.kind === "measured" ? `Measured (simulated): ${m.label}` : line.status === "unknown" ? "Evidence missing" : m.label}
        </p>
      </div>
      <p className="mt-0.5 text-xs text-ink-soft">{line.why}</p>
      {line.note && <p className="mt-1 text-sm">{line.note}</p>}
      {line.kind === "person" && open && canEdit && (
        <div className="mt-2 grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-end">
          {fixing ? <p className="text-xs text-ink-soft sm:max-w-[10rem]">This gate fails. Declare the fix; its owner then re-tests it.</p> : (
            <label className="text-xs text-ink-soft">{retest ? "Re-test result" : "Result"}
              <select className={field} value={status} onChange={(e) => setStatus(e.target.value as "pass" | "fail")}>
                <option value="pass">Passes</option><option value="fail">Fails</option>
              </select>
            </label>
          )}
          <div className="grid gap-2">
            <label className="text-xs text-ink-soft" htmlFor={noteId}>{fixing ? "What was fixed" : retest ? "What the re-test showed, and where the evidence is" : "What was checked, and where the evidence is"}
              <input id={noteId} className={field} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="One sentence, for the record" />
            </label>
            {fixing && (
              <label className="text-xs text-ink-soft" htmlFor={`${noteId}-change`}>Change reference: what was changed, and where its record is
                <input id={`${noteId}-change`} className={field} value={change} maxLength={300} onChange={(e) => setChange(e.target.value)} placeholder="e.g. change ticket, hosting report, or document" />
              </label>
            )}
          </div>
          <button type="button" className={btnGhost} disabled={busy || !note.trim() || (fixing && !change.trim())} onClick={() => void record()}>{busy ? "Recording…" : fixing ? "Declare the fix" : retest ? "Record the re-test" : line.status === "unknown" ? "Record" : "Record again"}</button>
        </div>
      )}
      {err && <p role="alert" className="mt-1 text-sm text-ember">✕ {err}</p>}
    </li>
  );
}

export default function EvidencePanel({ useCaseId, lines, missing, run, ruleset, canEdit }: { useCaseId: string; lines: GateLine[]; missing: string[]; run: RunView | null; ruleset: string; canEdit: boolean }) {
  const router = useRouter();
  const [requested, setRequested] = useState("GO_SUPERVISED");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const open = !!run && !run.signed;

  async function start() {
    setBusy(true); setMsg(null);
    const r = await post(`/api/admin/un/use-cases/${useCaseId}/evidence`, { action: "start", requested });
    setBusy(false);
    if (r.ok) router.refresh(); else setMsg({ ok: false, text: r.error ?? "The request failed." });
  }
  async function sign(decision: "SIGN" | "WITHHOLD") {
    if (!run) return;
    setBusy(true); setMsg(null);
    const r = await post(`/api/admin/un/runs/${run.id}/sign`, { decision, comment });
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, text: decision === "SIGN" ? "Signed. The verdict is now on the use case." : "Withheld. No verdict was written." }); router.refresh(); }
    else setMsg({ ok: false, text: r.error ?? "The request failed." });
  }

  return (
    <section className={`${card} mt-6`} aria-labelledby="ev-h" data-testid="evidence-panel">
      <h2 id="ev-h" className="font-display text-xl font-medium">Gate evidence and verdict</h2>
      <p className="mt-1 max-w-[68ch] text-sm text-ink-soft">Under {ruleset}, each gate below has to be evidenced by the person who owns it. The rules turn that evidence into a verdict, and a person signs it. Nothing here is staged: it is the record of this use case.</p>

      {!run || run.signed ? (
        <div className="mt-4">
          {run?.signed && (
            <p className="mb-3 text-sm" role="status">
              <span aria-hidden>{run.signed.decision === "SIGN" ? "✓" : "✕"}</span> {run.signed.decision === "SIGN" ? "Signed" : "Withheld"} by {run.signed.by}
              {run.verdict ? <> · <VerdictBadge verdict={run.verdict.verdict} /></> : null}
              {run.signed.comment ? <> · “{run.signed.comment}”</> : null}
              {" · "}<Link className="underline underline-offset-2" href={`/admin/federal/runs/${run.id}`}>Open the trace</Link>
            </p>
          )}
          {canEdit ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-ink-soft">Autonomy asked for
                <select className={field} value={requested} onChange={(e) => setRequested(e.target.value)}>
                  {Object.entries(LEVEL_EN).map(([l, en]) => <option key={l} value={l}>{en}</option>)}
                </select>
              </label>
              <button type="button" className={btnPrimary} disabled={busy} onClick={() => void start()}>{busy ? "Opening…" : run?.signed ? "Open a new evidence run" : "Open an evidence run"}</button>
            </div>
          ) : <p className="text-sm text-ink-soft">{run?.signed ? "" : "No evidence has been recorded. Read only: recording it needs an administrator."}</p>}
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-soft">Autonomy asked for: {LEVEL_EN[run.requested ?? ""] ?? run.requested}. The verdict can come out at that level or below.</p>
      )}

      <ul className="mt-4" aria-label="Gates">
        {lines.map((l) => <Row key={l.id} line={l} useCaseId={useCaseId} canEdit={canEdit} open={open} />)}
      </ul>

      {run && !run.signed && (
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-sm">
            Verdict so far: {run.verdict ? <VerdictBadge verdict={run.verdict.verdict} /> : <span className="text-ink-soft">none yet</span>}
          </p>
          {run.verdict && run.verdict.reasons.length > 0 && <ul className="mt-1 list-disc ps-5 text-xs text-ink-soft">{run.verdict.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
          {missing.length > 0 && <p className="mt-2 text-sm text-ember">✕ {missing.length} gate{missing.length === 1 ? "" : "s"} still without evidence: {missing.join(", ")}. The verdict cannot be signed until each has some.</p>}
          {canEdit && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="min-w-[16rem] flex-1 text-xs text-ink-soft">Comment (required to withhold)
                <input className={field} value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} />
              </label>
              <button type="button" className={btnPrimary} disabled={busy || missing.length > 0 || !run.verdict} onClick={() => void sign("SIGN")}>Sign the verdict</button>
              <button type="button" className={btnGhost} disabled={busy || !run.verdict || !comment.trim()} onClick={() => void sign("WITHHOLD")}>Withhold</button>
            </div>
          )}
        </div>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-3 text-sm ${msg.ok ? "text-lit-deep" : "text-ember"}`}>{msg.ok ? "✓" : "✕"} {msg.text}</p>}
    </section>
  );
}
