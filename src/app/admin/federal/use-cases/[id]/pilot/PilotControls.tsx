"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { useLang } from "../../../_components/Lang";
import { btnPrimary } from "../../../_components/ui";

/** Run the approved tests of a job profile on the real agent. The server refuses unless the test set and the
 * verdict parameters are approved; its reason is shown as it is. */
export function RunPilot({ useCaseId, profile }: { useCaseId: string; profile: string }) {
  const lang = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/un/use-cases/${useCaseId}/pilot`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile }) });
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "The request failed."); return; }
    router.refresh();
  };
  return (
    <div>
      <button type="button" className={btnPrimary} disabled={busy} onClick={run}>{busy ? tr(lang, "pi.running", "Running the pilot…") : tr(lang, "pi.run", "Run the pilot")}</button>
      {error && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--color-v-nogo)" }}>{error}</p>}
    </div>
  );
}
