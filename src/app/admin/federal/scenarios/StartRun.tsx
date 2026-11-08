"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function StartRun({ scenarioId }: { scenarioId: string }) {
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
    <div className="text-right">
      <button onClick={start} disabled={busy} className="rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50">
        {busy ? "Starting…" : "Start run"}
      </button>
      {err && <p role="alert" className="mt-1 max-w-56 text-xs text-ember">✕ {err}</p>}
    </div>
  );
}
