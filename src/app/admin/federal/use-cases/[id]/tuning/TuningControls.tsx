"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { runBlockedReason, type ApprovalState } from "@/lib/un/tuning";
import { useLang } from "../../../_components/Lang";
import { btnGhost, btnPrimary, field } from "../../../_components/ui";

type Call = (method: string, path: string, body?: object) => Promise<boolean>;

function useCall(): { busy: boolean; error: string | null; call: Call } {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const call: Call = async (method, path, body) => {
    setBusy(true);
    setError(null);
    const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(d.error ?? "The request failed.");
      return false;
    }
    router.refresh();
    return true;
  };
  return { busy, error, call };
}

/** Run a tuning cycle; reset the demo. */
export function TuningControls({ useCaseId, canRun, state }: { useCaseId: string; canRun: boolean; state: ApprovalState }) {
  const lang = useLang();
  const { busy, error, call } = useCall();
  const base = `/api/admin/un/use-cases/${useCaseId}/tuning`;
  const blocked = runBlockedReason(state);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={btnPrimary} disabled={busy || !!blocked} aria-describedby={blocked ? "tune-blocked" : undefined} onClick={() => call("POST", base)}>
          {busy ? tr(lang, "tu.running", "Running…") : tr(lang, "tu.run", "Run a tuning cycle")}
        </button>
        <button type="button" className={btnGhost} disabled={busy || !canRun} onClick={() => call("DELETE", base)}>
          {tr(lang, "tu.reset", "Reset the demo")}
        </button>
      </div>
      {blocked && <p id="tune-blocked" className="mt-2 text-sm text-ink-soft">{tr(lang, state === "approved" ? "tu.blocked.approved" : "tu.blocked.ready", blocked)}</p>}
      {error && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--color-v-nogo)" }}>{error}</p>}
    </div>
  );
}

/** A person's decision on a certified agent version. */
export function ApproveForm({ useCaseId }: { useCaseId: string }) {
  const lang = useLang();
  const { busy, error, call } = useCall();
  const [comment, setComment] = useState("");
  const [local, setLocal] = useState<string | null>(null);
  const path = `/api/admin/un/use-cases/${useCaseId}/tuning/approve`;
  const decide = (decision: "SIGN" | "WITHHOLD") => {
    if (decision === "WITHHOLD" && !comment.trim()) {
      setLocal(tr(lang, "tu.approve.needcomment", "Withholding needs a comment."));
      return;
    }
    setLocal(null);
    void call("POST", path, { decision, comment });
  };
  return (
    <div>
      <label className="block text-sm font-medium" htmlFor="approve-comment">{tr(lang, "tu.approve.comment", "Comment")}</label>
      <textarea id="approve-comment" className={field} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" className={btnPrimary} disabled={busy} onClick={() => decide("SIGN")}>{tr(lang, "tu.approve.sign", "Approve")}</button>
        <button type="button" className={btnGhost} disabled={busy} onClick={() => decide("WITHHOLD")}>{tr(lang, "tu.approve.withhold", "Withhold approval")}</button>
      </div>
      {(local || error) && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--color-v-nogo)" }}>{local ?? error}</p>}
    </div>
  );
}
