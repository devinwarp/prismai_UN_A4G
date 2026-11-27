"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btnPrimary } from "../../../_components/ui";

/** Put the certified skill and its tuned guidance into production (or redeploy them for a newer SOP version): the server freezes them into one snapshot and generates its hash. */
export function SopDeployButton({ useCaseId, redeploy, canDeploy }: { useCaseId: string; redeploy: boolean; canDeploy: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function go() {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/admin/un/use-cases/${useCaseId}/watchdog`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deploy" }) });
    const j = (await r.json().catch(() => ({}))) as { error?: string; snapshot_sha256?: string };
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, text: `Deployed. Snapshot ${String(j.snapshot_sha256 ?? "").slice(0, 12)}.` }); router.refresh(); }
    else setMsg({ ok: false, text: j.error ?? "The request failed." });
  }
  return (
    <div className="mt-3">
      <button type="button" className={btnPrimary} disabled={busy || !canDeploy} onClick={() => void go()}>{busy ? "Deploying…" : redeploy ? "Redeploy on the newer SOP version" : "Deploy the certified skill and guidance"}</button>
      {!canDeploy && <p className="mt-1 text-xs text-ink-soft">Needs the business process owner&apos;s approval of the final pilot result and a met pilot.</p>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm ${msg.ok ? "text-lit-deep" : "text-ember"}`}>{msg.ok ? "✓" : "✕"} {msg.text}</p>}
    </div>
  );
}
