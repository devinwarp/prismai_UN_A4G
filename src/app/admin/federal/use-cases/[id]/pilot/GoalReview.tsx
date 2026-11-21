"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import type { Review } from "@/lib/un/goal-judge";
import { useLang } from "../../../_components/Lang";
import { btnGhost, btnPrimary, field } from "../../../_components/ui";

type Approver = { title: string; source: string };
type Choice = "keep" | "met" | "notmet";

/** Goal alignment: the model's judgment per test, and a person's approval with overrides. Nothing counts until approved. */
export function GoalReview({ useCaseId, profile, pilotId, review, approvers, mayRun, mayApprove, modelConfigured }: {
  useCaseId: string; profile: string; pilotId: string; review: Review | null; approvers: Approver[]; mayRun: boolean; mayApprove: boolean; modelConfigured: boolean;
}) {
  const lang = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [approver, setApprover] = useState(approvers[0]?.title ?? "");
  const [choice, setChoice] = useState<Record<string, Choice>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [withdrawReason, setWithdrawReason] = useState("");

  const send = async (body: object) => {
    setBusy(true); setError(null); setNote(null);
    const res = await fetch(`/api/admin/un/use-cases/${useCaseId}/pilot/goals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile, pilot_id: pilotId, ...body }) });
    const d = (await res.json().catch(() => ({}))) as { error?: string; note?: string };
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "The request failed."); return; }
    if (d.note) setNote(d.note);
    router.refresh();
  };

  const overrides = Object.entries(choice).filter(([, c]) => c !== "keep").map(([test_id, c]) => ({ test_id, met: c === "met", reason: (reason[test_id] ?? "").trim() }));
  const missingReason = overrides.some((o) => !o.reason);
  const label = (m: boolean | null) => (m === null ? tr(lang, "gr.unjudged", "Not judged") : m ? tr(lang, "gr.met", "Met") : tr(lang, "gr.notmet", "Not met"));

  return (
    <section className="mt-6 rounded-2xl border border-line bg-card p-5 sm:p-6" aria-labelledby="gr-h">
      <h2 id="gr-h" className="font-display text-xl font-medium">{tr(lang, "gr.h", "Goal alignment")}</h2>
      <p className="mt-1 text-sm text-ink-soft">{tr(lang, "gr.lede", "A model judges whether each test's output serves the entity's goals. Nothing counts until a person approves it; the person may override any judgment with a reason. Until then goal alignment reads not measured.")}</p>

      {!review ? (
        <div className="mt-4">
          {mayRun ? (
            <>
              <button type="button" className={btnPrimary} disabled={busy || !modelConfigured} onClick={() => send({ action: "judge" })}>{busy ? tr(lang, "gr.judging", "The model is judging…") : tr(lang, "gr.judge", "Have the model judge")}</button>
              {!modelConfigured && <p className="mt-2 text-sm text-ink-soft">{tr(lang, "gr.nomodel", "No model is configured for the judge.")}</p>}
            </>
          ) : <p className="text-sm font-medium">{tr(lang, "gr.readonly", "Read only. Having the model judge needs the pilot run permission.")}</p>}
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm" role="status">
            {review.approved ? `${tr(lang, "gr.approved", "Approved")} · ${review.approved.approver} · ${review.approved.hash.slice(0, 12)}` : tr(lang, "gr.pending", "Judged by the model, waiting for a person to approve")}
            <span className="ms-2 font-mono text-[11px] text-ink-soft">{review.model}</span>
          </p>
          <div className="mt-3 overflow-x-auto" role="region" tabIndex={0} aria-label={tr(lang, "gr.h", "Goal alignment")}>
            <table className="w-full text-sm">
              <thead><tr className="text-ink-soft">
                <th className="py-1 pe-3 text-start font-normal">{tr(lang, "gr.th.test", "Test")}</th>
                <th className="py-1 pe-3 text-start font-normal">{tr(lang, "gr.th.model", "Model")}</th>
                <th className="py-1 pe-3 text-start font-normal">{tr(lang, "gr.th.why", "Why")}</th>
                <th className="py-1 text-start font-normal">{tr(lang, "gr.th.person", "Person")}</th>
              </tr></thead>
              <tbody>
                {review.judgments.map((j) => {
                  const ov = review.approved?.overrides.find((o) => o.test_id === j.test_id);
                  return (
                    <tr key={j.test_id} className="border-t border-line align-top">
                      <td className="py-1 pe-3 font-mono text-xs">{j.test_id}</td>
                      <td className="py-1 pe-3">{label(j.met)}</td>
                      <td className="py-1 pe-3 text-xs text-ink-soft">{j.reason}{j.goals.filter((g) => !g.met).map((g) => <span key={g.id} className="block">{g.id}: {g.reason}</span>)}</td>
                      <td className="py-1">
                        {review.approved ? (ov ? <span>{label(ov.met)} <span className="text-xs text-ink-soft">({ov.reason})</span></span> : <span className="text-xs text-ink-soft">{tr(lang, "gr.kept", "Kept")}</span>)
                          : mayApprove ? (
                            <div>
                              <select aria-label={`${tr(lang, "gr.th.person", "Person")} ${j.test_id}`} className={field} value={choice[j.test_id] ?? "keep"} onChange={(e) => setChoice({ ...choice, [j.test_id]: e.target.value as Choice })}>
                                <option value="keep">{tr(lang, "gr.keep", "Keep the model's judgment")}</option>
                                <option value="met">{tr(lang, "gr.setmet", "Override: met")}</option>
                                <option value="notmet">{tr(lang, "gr.setnotmet", "Override: not met")}</option>
                              </select>
                              {(choice[j.test_id] ?? "keep") !== "keep" && <input aria-label={`${tr(lang, "gr.reason", "Reason (logged)")} ${j.test_id}`} placeholder={tr(lang, "gr.reason", "Reason (logged)")} className={`${field} mt-1`} value={reason[j.test_id] ?? ""} maxLength={400} onChange={(e) => setReason({ ...reason, [j.test_id]: e.target.value })} />}
                            </div>
                          ) : <span className="text-xs text-ink-soft">–</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!review.approved && mayApprove && (
            <div className="mt-4">
              <label className="block text-sm font-medium" htmlFor="gr-ap">{tr(lang, "ts.approver", "Approver (from the list for this use case)")}</label>
              <select id="gr-ap" className={field} value={approver} onChange={(e) => setApprover(e.target.value)}>{approvers.map((a) => <option key={a.title} value={a.title}>{a.title}</option>)}</select>
              <button type="button" className={`${btnPrimary} mt-3`} disabled={busy || !approver || missingReason} onClick={() => send({ action: "approve", approver, overrides })}>{tr(lang, "gr.approve", "Approve these judgments")}</button>
              {missingReason && <p className="mt-2 text-sm text-ink-soft">{tr(lang, "gr.needreason", "Every override needs a reason.")}</p>}
            </div>
          )}
          {!review.approved && !mayApprove && <p className="mt-3 text-sm text-ink-soft">{tr(lang, "gr.noapprove", "Approving needs the goal approval permission.")}</p>}
          {review.approved && mayApprove && (
            <div className="mt-4">
              <label className="block text-sm" htmlFor="gr-wd">{tr(lang, "ts.reason", "Reason (logged)")}</label>
              <input id="gr-wd" className={field} value={withdrawReason} maxLength={500} onChange={(e) => setWithdrawReason(e.target.value)} />
              <button type="button" className={`${btnGhost} mt-2`} disabled={busy || !withdrawReason.trim()} onClick={() => send({ action: "withdraw", reason: withdrawReason })}>{tr(lang, "gr.withdraw", "Withdraw the approval")}</button>
            </div>
          )}
        </>
      )}
      {note && <p className="mt-2 text-sm">{note}</p>}
      {error && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--color-v-nogo)" }}>{error}</p>}
    </section>
  );
}
