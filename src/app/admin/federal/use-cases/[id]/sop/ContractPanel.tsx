"use client";

import { useEffect, useState } from "react";
import { btnGhost, btnPrimary, field } from "../../../_components/ui";

// What each task of a job profile RETURNS: its result text and, where it chooses between outcomes, the outcomes. It is read off the SOP's own text, then checked, changed and
// approved here by the job position holder (or the process owner). The skill carries what is approved, the tests are written against it, the pilot checks it. The SOP is not edited.

interface Task { task: string; output: string; decision: string[] | null }
interface State {
  profile: string;
  titles: Record<string, string>;
  derived: Task[];
  state: { pending: { version: number; tasks: Task[]; source: "derived" | "person"; by: string; note?: string } | null; approved: { version: number; tasks: Task[]; approver: string; at: string; hash: string } | null; proposals: number };
  drifted: boolean;
  chain: { ok: boolean };
  you: { ok: true; as: "holder" | "process_owner"; approver: { title: string } } | { ok: false; error: string };
  holders: string[];
  skill: { ticked: boolean; stored: string | null; live: string | null; current: boolean; resultFormat: Record<string, string>; version: number | null };
  versions: { version: number; sha256: string; reason: string; contract_version: number | null; by: string; at: string; current: boolean }[];
}

async function call(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; j: Record<string, unknown> }> {
  try {
    const r = await fetch(url, init);
    return { ok: r.ok, status: r.status, j: (await r.json().catch(() => ({}))) as Record<string, unknown> };
  } catch { return { ok: false, status: 0, j: { error: "The request failed." } }; }
}

const REASON: Record<string, string> = { ticked: "profile ticked", kb_rebuilt: "knowledge base rebuilt", reextracted: "re-extracted", contract_approved: "output format approved", contract_withdrawn: "approval withdrawn" };
const toDraft = (t: Task) => ({ task: t.task, output: t.output, outcomes: (t.decision ?? []).join(", ") });
const fromDraft = (d: { task: string; output: string; outcomes: string }): Task => {
  const values = d.outcomes.split(",").map((v) => v.trim()).filter(Boolean);
  return { task: d.task, output: d.output.trim(), decision: values.length ? values : null };
};

export default function ContractPanel({ ucId, profile, canEdit, canApprove, frozen }: { ucId: string; profile: string; canEdit: boolean; canApprove: boolean; frozen: boolean }) {
  const base = `/api/admin/un/use-cases/${ucId}/contract`;
  const [s, setS] = useState<State | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{ task: string; output: string; outcomes: string }[]>([]);
  const [dirty, setDirty] = useState(false);

  const [tick, setTick] = useState(0);
  const load = () => setTick((t) => t + 1);
  useEffect(() => {
    let live = true;
    void call(`${base}?profile=${encodeURIComponent(profile)}`).then((r) => {
      if (!live) return;
      if (!r.ok) { setErr(String(r.j.error ?? "The output format could not be read.")); return; }
      const st = r.j as unknown as State;
      setErr(""); setS(st);
      // the copy a person works on: the proposal waiting, else the approved one, else what the SOP's text gives
      const working = st.state.pending?.tasks ?? st.state.approved?.tasks ?? st.derived;
      setDraft(working.map(toDraft)); setDirty(false);
    });
    return () => { live = false; };
  }, [base, profile, tick]);

  async function act(body: Record<string, unknown>, ok: string) {
    setBusy(true); setMsg(null);
    const r = await call(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile, ...body }) });
    setBusy(false);
    const skill = r.j.skill as { ok?: boolean; reason?: string } | undefined;
    if (r.ok || (r.status === 409 && body.action === "reextract" && skill)) {
      setMsg({ ok: !!r.ok && skill?.ok !== false, text: skill && skill.ok === false ? `${ok} The skill could not be rebuilt: ${skill.reason}` : ok });
      load();
    } else setMsg({ ok: false, text: String(r.j.error ?? "The request failed.") });
  }

  if (err) return <p role="alert" className="mt-2 text-sm text-ember">✕ {err}</p>;
  if (!s) return <p className="mt-2 text-sm text-ink-soft">Reading the output format…</p>;

  const { pending, approved } = s.state;
  const approvedNow = !!approved && !pending;
  // only the holder of the job (or the process owner) may change or approve it; anyone with the operator role may still re-extract the skill
  const mayAct = s.you.ok;
  const stateLine = pending
    ? `Waiting for approval: ${pending.source === "derived" ? "read from the SOP's text, nobody has checked it yet" : "a person's version"}.`
    : approved ? `Approved (version ${approved.version}) by ${approved.approver}, ${new Date(approved.at).toLocaleDateString("en-GB")}.`
    : "Not approved: the skill, the tests and the pilot cannot start until a person approves it.";
  const skillLine = !s.skill.ticked ? "" : s.skill.current ? "The stored skill is built from this." : s.skill.stored ? "The stored skill is out of date: re-extract it." : "No skill is stored yet: re-extract it.";

  return (
    <div className="mt-2 rounded-xl border border-line bg-paper p-4" data-testid={`contract-${profile}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{profile}: what each task returns</p>
        <p className="text-sm" role="status"><span aria-hidden>{approvedNow ? "✓" : "!"}</span> {stateLine}</p>
      </div>
      {s.drifted && <p className="mt-1 text-sm text-ember">✕ The SOP&apos;s text now gives a different output for at least one task than the one approved. Re-extract to put the new one in front of a person.</p>}
      {skillLine && <p className={`mt-1 text-xs ${s.skill.current ? "text-ink-soft" : "text-ember"}`}>{s.skill.current ? "✓" : "✕"} {skillLine}</p>}

      <ul className="mt-3 space-y-3">
        {draft.map((d, i) => (
          <li key={d.task} className="rounded-lg border border-line px-3 py-2">
            <p className="text-sm font-medium">{d.task} <span className="font-normal text-ink-soft">· {s.titles[d.task]}</span></p>
            <label className="mt-1 block text-xs text-ink-soft" htmlFor={`ct-out-${profile}-${d.task}`}>What the task returns (shown in the skill)
              <input id={`ct-out-${profile}-${d.task}`} className={field} value={d.output} maxLength={300} disabled={!canEdit || frozen || !mayAct}
                onChange={(e) => { setDraft((x) => x.map((y, k) => (k === i ? { ...y, output: e.target.value } : y))); setDirty(true); }} />
            </label>
            <label className="mt-2 block text-xs text-ink-soft" htmlFor={`ct-dec-${profile}-${d.task}`}>Outcomes it chooses between, separated by commas (leave empty if it makes no choice)
              <input id={`ct-dec-${profile}-${d.task}`} className={field} value={d.outcomes} disabled={!canEdit || frozen || !mayAct} placeholder="e.g. meets, does not meet, query"
                onChange={(e) => { setDraft((x) => x.map((y, k) => (k === i ? { ...y, outcomes: e.target.value } : y))); setDirty(true); }} />
            </label>
            {s.skill.resultFormat[d.task] && <p className="mt-2 text-xs text-ink-soft"><span className="font-medium">The skill says:</span> {s.skill.resultFormat[d.task]}</p>}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-soft">The agent returns the result and its reason in <code>output.answer</code>; where a task has outcomes, exactly one of them in <code>output.facts.decision</code>. Nothing else in <code>output.facts</code> is defined or tested.</p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        {canEdit && !frozen && <button type="button" className={btnGhost} disabled={busy || !dirty || !mayAct} onClick={() => void act({ action: "propose", tasks: draft.map(fromDraft) }, "Saved as a proposal for approval.")}>Save my changes</button>}
        {canEdit && !frozen && <button type="button" className={btnGhost} disabled={busy} onClick={() => void act({ action: "reextract" }, "Skill re-extracted from the SOP.")}>Re-extract the skill</button>}
      </div>

      {(pending || dirty) && canApprove && !frozen && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
          <button type="button" className={btnPrimary} disabled={busy || !mayAct}
            onClick={() => void act(dirty ? { action: "approve", tasks: draft.map(fromDraft) } : { action: "approve" }, "Approved. What you changed is in the skill now, as a new version of it: regenerate and approve the tests.")}>{dirty ? "Save and approve" : "Approve this output format"}</button>
          {s.you.ok && <p className="text-xs text-ink-soft">You approve as {s.you.approver.title} ({s.you.as === "holder" ? "the holder of this job" : "the process owner"}). Your changes go into the skill with your approval: nobody approves them again.</p>}
        </div>
      )}
      {approvedNow && canApprove && !frozen && (
        <p className="mt-3"><button type="button" className={btnGhost} disabled={busy} onClick={() => { const reason = window.prompt("Why is the approval withdrawn?"); if (reason) void act({ action: "withdraw", reason }, "Approval withdrawn."); }}>Withdraw the approval</button></p>
      )}
      {!s.you.ok && <p className="mt-2 text-xs text-ink-soft" role="note">{s.you.error}{s.holders.length ? ` Holder: ${s.holders.join(", ")}.` : " Nobody holds this job yet: the process owner can act in the meantime."}</p>}
      {s.versions.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer font-medium">Skill versions ({s.versions.length}){s.skill.version ? `: the stored skill is version ${s.skill.version}` : ""}</summary>
          <ul className="mt-2 space-y-1 text-ink-soft">
            {[...s.versions].reverse().map((v) => (
              <li key={v.version}><span className="font-mono">v{v.version}</span> · {REASON[v.reason] ?? v.reason}{v.contract_version ? ` (contract v${v.contract_version})` : ""} · {v.by} · {new Date(v.at).toLocaleString("en-GB")} · <span className="font-mono">{v.sha256.slice(0, 10)}</span>{v.current ? " · stored now" : ""}</li>
            ))}
          </ul>
        </details>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-3 text-sm ${msg.ok ? "text-lit-deep" : "text-ember"}`}>{msg.ok ? "✓" : "✕"} {msg.text}</p>}
    </div>
  );
}
