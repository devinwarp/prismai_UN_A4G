"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import type { GenState } from "@/lib/un/testgen";
import { useLang } from "../../../_components/Lang";
import { btnGhost, btnPrimary, card, field } from "../../../_components/ui";

type Chain = { ok: boolean };

/** AI-generated test cases for one job profile: generate for a task, then approve or reject each proposal. A proposal
 * is not part of the test set until a person approves it; the set is then approved and locked as before. */
export function TestgenPanel({ useCaseId, profile, state, chain, tasks, model, mayPropose, mayEdit, storeError }: {
  useCaseId: string; profile: string; state: GenState; chain: Chain; tasks: { id: string; title: string }[]; model: string; mayPropose: boolean; mayEdit: boolean;
  /** Set when the proposal log cannot be read (for example the migration is not applied). */
  storeError?: string | null;
}) {
  const lang = useLang();
  const router = useRouter();
  const [task, setTask] = useState(tasks[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const send = async (body: object) => {
    setBusy(true); setError(null);
    const res = await fetch(`/api/admin/un/use-cases/${useCaseId}/testgen`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile, ...body }) });
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) { setError(d.error ?? tr(lang, "tg.failed", "The request failed.")); return; }
    setRejecting(null); setWhy("");
    router.refresh();
  };
  const last = state.runs[state.runs.length - 1];
  const status = (s: string) => (s === "accepted" ? tr(lang, "tg.s.accepted", "In the test set") : s === "rejected" ? tr(lang, "tg.s.rejected", "Rejected") : tr(lang, "tg.s.proposed", "Proposed: not yet in the test set"));

  return (
    <section className={`${card} mt-6`} aria-labelledby="tg-h">
      <h2 id="tg-h" className="font-display text-xl font-medium">{tr(lang, "tg.h", "Generated test cases")}</h2>
      <p className="mt-1 max-w-[68ch] text-sm text-ink-soft">{tr(lang, "tg.lede", "A reasoning agent writes cases from the skill, the risk, the gates and the SOP lines. The expected outcome comes from the SOP, not from our own cases. Everything below is a proposal until a person approves it.")}</p>
      <p className="mt-2 font-mono text-xs text-ink-soft">{tr(lang, "tg.model", "Generator model")}: {model}</p>
      <p className="mt-2 max-w-[68ch] text-sm font-medium">{tr(lang, "tg.notrun", "For now an approved case is not run by the pilot: it joins the test set and is listed as not executed, and it does not change the pilot's numbers.")}</p>
      {storeError && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--color-v-nogo)" }}>{storeError}</p>}
      {!chain.ok && <p role="alert" className="mt-2 text-sm">{tr(lang, "tg.chain.bad", "The proposal log chain is broken; changes are refused until it is repaired.")}</p>}

      {mayPropose ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-sm font-medium" htmlFor="tg-task">{tr(lang, "tg.task", "Task to generate for")}</label>
            <select id="tg-task" className={field} value={task} onChange={(e) => setTask(e.target.value)}>
              {tasks.map((t) => <option key={t.id} value={t.id}>{t.id}. {t.title}</option>)}
            </select>
          </div>
          <button type="button" className={btnPrimary} disabled={busy || !task || !chain.ok || !!storeError} onClick={() => send({ action: "generate", task })}>{busy ? tr(lang, "tg.working", "Working...") : tr(lang, "tg.generate", "Generate cases")}</button>
        </div>
      ) : (
        <p className="mt-3 text-sm font-medium">{tr(lang, "tg.readonly", "Read only. Generating cases needs the scenario propose permission.")}</p>
      )}
      {error && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--color-v-nogo)" }}>{error}</p>}

      {last && (
        <div className="mt-4 rounded-lg border border-line px-3 py-2 text-sm" role="status">
          <p className="font-medium">{tr(lang, "tg.last", "Last run")}: {last.scenario_id} · {last.cases} {tr(lang, "tg.kept", "cases kept")} · {last.rejected.length} {tr(lang, "tg.dropped", "dropped")}{last.calls !== undefined && ` · ${last.calls} ${tr(lang, "tg.calls", "model calls")}`}</p>
          {last.repair && (
            <p className="mt-1" data-testid="tg-repair">
              {last.repair.outcome === "ok"
                ? `${tr(lang, "tg.repair.ok", "Repair pass")}: ${last.repair.before} → ${last.cases} ${tr(lang, "tg.kept", "cases kept")} (${last.repair.rescued} ${tr(lang, "tg.rescued", "rescued by the repair call")})`
                : `${tr(lang, "tg.repair.bad", "The repair call did not help; the first result was kept")}: ${last.repair.note ?? last.repair.outcome}`}
              <span className="font-mono text-xs text-ink-soft" dir="ltr"> · {tr(lang, "tg.hashes", "prompt hashes")} {last.prompt_hash} / {last.repair.prompt_hash}</span>
            </p>
          )}
          {last.rejected.length > 0 && <ul className="mt-1 list-disc ps-5">{last.rejected.map((r, i) => <li key={i}>{r.id ?? tr(lang, "tg.noid", "(no id)")}: {r.reason}</li>)}</ul>}
          {last.gaps.length > 0 && (
            <>
              <p className="mt-2 font-medium">{tr(lang, "tg.gaps", "Coverage gaps")}</p>
              <ul className="mt-1 list-disc ps-5">{last.gaps.map((g, i) => <li key={i}>{g.message}</li>)}</ul>
            </>
          )}
        </div>
      )}

      <h3 className="mt-5 text-base font-medium">{tr(lang, "tg.list", "Proposals")} ({state.proposals.length})</h3>
      {state.proposals.length === 0 && <p className="mt-2 text-sm text-ink-soft">{tr(lang, "tg.none", "No generated cases yet.")}</p>}
      <ul className="mt-2 space-y-3">
        {state.proposals.map(({ case: c, status: st, reject_reason }) => (
          <li key={c.id} className="rounded-xl border border-line p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">{c.title}{c.repaired && <span className="ms-2 rounded border border-line px-1.5 py-0.5 text-[11px] font-normal">{tr(lang, "tg.repaired", "repaired")}</span>}</p>
              <p className="font-mono text-[11px] text-ink-soft">{c.id} · {c.family} · {tr(lang, "tg.conf", "confidence")} {c.confidence}</p>
            </div>
            <p className="mt-1 text-sm">{tr(lang, "tg.expect", "Expected")}: {c.expect.summary}</p>
            {c.input.kind === "sop" && <p className="mt-1 whitespace-pre-wrap break-words text-sm"><span className="font-medium">Test input </span>{c.input.request}</p>}
            <ul className="mt-1 list-disc ps-5 font-mono text-xs text-ink-soft" dir="ltr">
              {c.expect.assertions.map((a, i) => <li key={i}>{a.path} {a.op}{a.value === undefined ? "" : ` ${JSON.stringify(a.value)}`}</li>)}
            </ul>
            <p className="mt-1 text-xs text-ink-soft">{tr(lang, "tg.gate", "Gates")}: {c.gates.length ? c.gates.join(", ") : tr(lang, "tg.nogate", "none")} · {tr(lang, "tg.cite", "Citations")}: <span className="font-mono" dir="ltr">{c.citations.join(", ")}</span></p>
            <p className="mt-1 text-xs text-ink-soft">{tr(lang, "tg.why", "Why")}: {c.rationale}</p>
            <p className="mt-1 text-xs font-medium" role="status">{status(st)}{st === "rejected" && reject_reason ? `: ${reject_reason}` : ""}</p>
            {st === "proposed" && mayEdit && (
              <div className="mt-2">
                {rejecting === c.id ? (
                  <>
                    <label className="block text-sm font-medium" htmlFor={`tg-why-${c.id}`}>{tr(lang, "tg.rejwhy", "Why is it rejected?")}</label>
                    <input id={`tg-why-${c.id}`} className={field} value={why} onChange={(e) => setWhy(e.target.value)} maxLength={500} />
                    <button type="button" className={`${btnGhost} mt-2`} disabled={busy || why.trim().length < 3} onClick={() => send({ action: "reject", case_id: c.id, reason: why })}>{tr(lang, "tg.reject.go", "Reject case")}</button>
                  </>
                ) : (
                  <div className="flex gap-2">
                    <button type="button" className={btnPrimary} disabled={busy} onClick={() => send({ action: "accept", case_id: c.id })}>{tr(lang, "tg.approve", "Approve into the test set")}</button>
                    <button type="button" className={btnGhost} disabled={busy} onClick={() => setRejecting(c.id)}>{tr(lang, "tg.reject", "Reject")}</button>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {mayEdit && state.proposals.some((p) => p.status === "proposed") && <p className="mt-3 text-xs text-ink-soft">{tr(lang, "tg.after", "An approved case joins the test set as a draft. Approve and lock the set above as usual; the approval names the person.")}</p>}
    </section>
  );
}
