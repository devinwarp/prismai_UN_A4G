"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btnGhost, btnPrimary } from "../_components/ui";

export default function StartRun({ scenarioId, primary = false }: { scenarioId: string; primary?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function start() {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/admin/un/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario_id: scenarioId }),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    setBusy(false);
    if (res.ok && data.id) router.push(`/admin/federal/runs/${data.id}`);
    else setErr(data.error ?? "Could not start");
  }
  return (
    <div className="text-end">
      <button onClick={start} disabled={busy} className={`${primary ? btnPrimary : btnGhost} px-5 py-2.5`}>
        {busy ? "Starting…" : "Start run"} <span aria-hidden className="rtl:rotate-180">→</span>
      </button>
      {err && <p role="alert" className="mt-1 max-w-56 text-xs text-ember">✕ {err}</p>}
    </div>
  );
}
