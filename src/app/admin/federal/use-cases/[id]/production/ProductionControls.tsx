"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { SUBJECT_RULES, type SubjectRule } from "@/lib/un/subject";
import { useLang } from "../../../_components/Lang";
import { btnGhost, btnPrimary, field } from "../../../_components/ui";

function useCall(useCaseId: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const path = `/api/admin/un/use-cases/${useCaseId}/watchdog`;
  async function call(method: "POST" | "DELETE", body?: object) {
    setBusy(true);
    setError(null);
    const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) setError(d.error ?? "The request failed.");
    else router.refresh();
    return res.ok;
  }
  return { busy, error, call };
}

/** Deploy, run a monitoring window (optionally with a simulated regression), reset. */
export function ProductionControls({ useCaseId, deployed, serving, canDeploy, rules }: { useCaseId: string; deployed: boolean; serving: boolean; canDeploy: boolean; rules: SubjectRule[] }) {
  const lang = useLang();
  const { busy, error, call } = useCall(useCaseId);
  const [drift, setDrift] = useState("");
  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        {!deployed && (
          <button type="button" className={btnPrimary} disabled={busy || !canDeploy} onClick={() => call("POST", { action: "deploy" })}>
            {tr(lang, "pr.deploy", "Put the approved version into production")}
          </button>
        )}
        {deployed && (
          <>
            <div>
              <label htmlFor="drift" className="block text-sm font-medium">{tr(lang, "pr.drift.label", "Simulate a regression: drop this rule from the serving agent")}</label>
              <select id="drift" className={field} value={drift} onChange={(e) => setDrift(e.target.value)} disabled={!serving}>
                <option value="">{tr(lang, "pr.drift.none", "No regression (normal window)")}</option>
                {rules.map((r) => <option key={r} value={r}>{tr(lang, `rule.${r}`, SUBJECT_RULES[r])}</option>)}
              </select>
            </div>
            <button type="button" className={btnPrimary} disabled={busy || !serving} onClick={() => call("POST", { action: "window", drift: drift || null })}>
              {busy ? tr(lang, "pr.running", "Running…") : tr(lang, "pr.window", "Run a monitoring window")}
            </button>
          </>
        )}
        <button type="button" className={btnGhost} disabled={busy || !deployed} onClick={() => call("DELETE")}>{tr(lang, "pr.reset", "Reset the demo")}</button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--color-v-nogo)" }}>{error}</p>}
    </div>
  );
}

/** A person brings a suspended agent back (rollback, re-test, probation). */
export function ReinstateForm({ useCaseId }: { useCaseId: string }) {
  const lang = useLang();
  const { busy, error, call } = useCall(useCaseId);
  const [comment, setComment] = useState("");
  const [local, setLocal] = useState<string | null>(null);
  return (
    <div>
      <label className="block text-sm font-medium" htmlFor="reinstate-comment">{tr(lang, "pr.re.comment", "What was fixed")}</label>
      <textarea id="reinstate-comment" className={field} rows={2} value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} />
      <div className="mt-3">
        <button
          type="button"
          className={btnPrimary}
          disabled={busy}
          onClick={() => {
            if (!comment.trim()) return setLocal(tr(lang, "pr.re.needcomment", "Reinstating needs a comment saying what was fixed."));
            setLocal(null);
            void call("POST", { action: "reinstate", comment });
          }}
        >
          {tr(lang, "pr.re.go", "Reinstate on probation")}
        </button>
      </div>
      {(local || error) && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--color-v-nogo)" }}>{local ?? error}</p>}
    </div>
  );
}
