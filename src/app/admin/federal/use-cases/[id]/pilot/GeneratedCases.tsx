"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import type { GeneratedBlock } from "@/lib/un/pilot";
import type { Ruling } from "@/lib/un/testgen";
import { useLang } from "../../../_components/Lang";
import { btnGhost, btnPrimary, card, field } from "../../../_components/ui";

/** The accepted AI-generated cases of a pilot, apart from the baseline: which agreed with their expectation and which were disputed.
 * A disputed case is not a failure: the expectation may be the wrong one. A person with the goals approval permission rules on it. */
export function GeneratedCases({ useCaseId, profile, pilotId, block, rulings, mayRule }: {
  useCaseId: string; profile: string; pilotId: string; block: GeneratedBlock; rulings: Ruling[]; mayRule: boolean;
}) {
  const lang = useLang();
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [ruling, setRuling] = useState<"expectation_wrong" | "agent_wrong">("expectation_wrong");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const ruled = (caseId: string) => rulings.find((r) => r.case_id === caseId && r.pilot_id === pilotId);
  const send = async (caseId: string) => {
    setBusy(true); setError(null); setNote(null);
    const res = await fetch(`/api/admin/un/use-cases/${useCaseId}/testgen`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile, action: "rule", pilot_id: pilotId, case_id: caseId, ruling, reason: why }) });
    const d = (await res.json().catch(() => ({}))) as { error?: string; needs_reapproval?: boolean };
    setBusy(false);
    if (!res.ok) { setError(d.error ?? tr(lang, "tg.failed", "The request failed.")); if (d.error) router.refresh(); return; }
    if (d.needs_reapproval) setNote(tr(lang, "gp.reapprove", "The test was retired, so the test set must be approved again before the next pilot."));
    setOpen(null); setWhy("");
    router.refresh();
  };
  const confirmed = block.cases.filter((c) => c.disputed_reps > 0 && ruled(c.case_id)?.ruling === "agent_wrong").length;
  const dropped = block.cases.filter((c) => c.disputed_reps > 0 && ruled(c.case_id)?.ruling === "expectation_wrong").length;
  const waiting = block.cases.filter((c) => c.disputed_reps > 0 && !ruled(c.case_id)).length;

  return (
    <section className={`${card} mt-6`} aria-labelledby="gp-h">
      <h2 id="gp-h" className="font-display text-xl font-medium">{tr(lang, "gp.h", "Generated cases")}</h2>
      <p className="mt-1 max-w-[68ch] text-sm text-ink-soft">{tr(lang, "gp.lede", "Cases an AI wrote from the SOP and a person accepted, run on the agent beside the baseline. They do not move any baseline number or threshold. A case that does not agree is disputed, not failed: the expectation may be wrong, and a person rules.")}</p>
      <p className="mt-2 text-sm" role="status">
        {block.tests} {tr(lang, "gp.tests", "cases")} · {block.agree} {tr(lang, "gp.agree", "agree")} · {block.disputed} {tr(lang, "gp.disputed", "disputed")}
        {block.disputed > 0 && ` (${waiting} ${tr(lang, "gp.waiting", "waiting for a ruling")}, ${confirmed} ${tr(lang, "gp.confirmed", "confirmed agent failures")}, ${dropped} ${tr(lang, "gp.dropped", "expectation wrong")})`}
      </p>
      {note && <p className="mt-2 text-sm font-medium" role="status">{note}</p>}
      <ul className="mt-3 space-y-2">
        {block.cases.map((c) => {
          const r = ruled(c.case_id);
          return (
            <li key={c.test_id} className="rounded-xl border border-line p-3 text-sm">
              <p className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-mono text-xs">{c.case_id || c.test_id}</span><span className="text-xs">{c.disputed_reps === 0 ? tr(lang, "gp.agrees", "agrees") : `${tr(lang, "gp.disputed", "disputed")} ${c.disputed_reps}/${c.reps}`}</span></p>
              {c.differences.length > 0 && <ul className="mt-1 list-disc ps-5 font-mono text-xs text-ink-soft" dir="ltr">{c.differences.map((d, i) => <li key={i}>{d}</li>)}</ul>}
              {r && <p className="mt-1 text-xs font-medium">{r.ruling === "agent_wrong" ? tr(lang, "gp.r.agent", "Ruled: the agent was wrong (a confirmed failure)") : tr(lang, "gp.r.exp", "Ruled: the expectation was wrong (the test is retired)")}: {r.reason} · {r.by}</p>}
              {c.disputed_reps > 0 && !r && mayRule && (
                open === c.case_id ? (
                  <div className="mt-2">
                    <label className="block text-sm font-medium" htmlFor={`gp-r-${c.test_id}`}>{tr(lang, "gp.ruling", "Ruling")}</label>
                    <select id={`gp-r-${c.test_id}`} className={field} value={ruling} onChange={(e) => setRuling(e.target.value as typeof ruling)}>
                      <option value="expectation_wrong">{tr(lang, "gp.opt.exp", "The expectation was wrong")}</option>
                      <option value="agent_wrong">{tr(lang, "gp.opt.agent", "The agent was wrong")}</option>
                    </select>
                    <label className="mt-2 block text-sm font-medium" htmlFor={`gp-w-${c.test_id}`}>{tr(lang, "gp.why", "Reason")}</label>
                    <input id={`gp-w-${c.test_id}`} className={field} value={why} maxLength={500} onChange={(e) => setWhy(e.target.value)} />
                    <div className="mt-2 flex gap-2">
                      <button type="button" className={btnPrimary} disabled={busy || why.trim().length < 3} onClick={() => send(c.case_id)}>{tr(lang, "gp.rule", "Record the ruling")}</button>
                      <button type="button" className={btnGhost} disabled={busy} onClick={() => setOpen(null)}>{tr(lang, "gp.cancel", "Cancel")}</button>
                    </div>
                  </div>
                ) : <button type="button" className={`${btnGhost} mt-2`} onClick={() => setOpen(c.case_id)}>{tr(lang, "gp.open", "Rule on this case")}</button>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--color-v-nogo)" }}>{error}</p>}
    </section>
  );
}
