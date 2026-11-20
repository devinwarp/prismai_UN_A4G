"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { useLang } from "../../../_components/Lang";
import { btnPrimary } from "../../../_components/ui";

export default function EvalRunButton({ useCaseId, again }: { useCaseId: string; again: boolean }) {
  const router = useRouter();
  const lang = useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/un/use-cases/${useCaseId}/eval`, { method: "POST" });
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) setError(d.error ?? "The evaluation failed.");
    else router.refresh();
  }

  return (
    <div>
      <button type="button" className={btnPrimary} onClick={run} disabled={busy}>
        {busy ? tr(lang, "ev.running", "Running…") : again ? tr(lang, "ev.again", "Run the eval set again") : tr(lang, "ev.run", "Run the eval set")}
      </button>
      {error && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--color-v-nogo)" }}>{error}</p>}
    </div>
  );
}
