"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { useLang } from "../../../_components/Lang";
import { btnPrimary, field } from "../../../_components/ui";

/** Run the approved tests of a job profile on the real agent. The server refuses unless the test set and the
 * verdict parameters are approved; its reason is shown as it is. */
export function RunPilot({ useCaseId, profile }: { useCaseId: string; profile: string }) {
  const lang = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agent, setAgent] = useState<"rule" | "llm">("rule");
  const run = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/un/use-cases/${useCaseId}/pilot`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile, agent }) });
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "The request failed."); return; }
    router.refresh();
  };
  return (
    <div>
      <label className="block text-sm font-medium" htmlFor="pi-agent">{tr(lang, "pi.agent", "Agent to test")}</label>
      <select id="pi-agent" className={`${field} max-w-md`} value={agent} onChange={(e) => setAgent(e.target.value as "rule" | "llm")} disabled={busy}>
        <option value="rule">{tr(lang, "pi.agent.rule", "Code-based reasoner (fast, no model calls)")}</option>
        <option value="llm">{tr(lang, "pi.agent.llm", "Model-driven agent (slow, uses the model: writes the fee notices and reflects on its answers)")}</option>
      </select>
      <button type="button" className={`${btnPrimary} mt-3`} disabled={busy} onClick={run}>{busy ? tr(lang, "pi.running", "Running the pilot…") : tr(lang, "pi.run", "Run the pilot")}</button>
      {error && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--color-v-nogo)" }}>{error}</p>}
    </div>
  );
}
