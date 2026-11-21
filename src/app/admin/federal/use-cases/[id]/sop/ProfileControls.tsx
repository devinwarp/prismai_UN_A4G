"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TV, useLang } from "../../../_components/Lang";
import { tr } from "@/lib/un/i18n/dict";

async function post(id: string, body: object): Promise<string | null> {
  const r = await fetch(`/api/admin/un/use-cases/${id}/profiles`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.ok ? null : ((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`;
}

/** The Automate checkbox. Admin only: a viewer sees the state as text. */
export function AutomateBox({ ucId, profile, checked, canEdit }: { ucId: string; profile: string; checked: boolean; canEdit: boolean }) {
  const lang = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const label = checked ? tr(lang, "pf.auto", "Automated") : tr(lang, "pf.manual", "Manual");
  return (
    <div>
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox" className="size-4 accent-[var(--color-lit)]" checked={checked} disabled={!canEdit || busy}
          aria-label={`${tr(lang, "pf.automate", "Automate")}: ${profile}`}
          title={canEdit ? undefined : tr(lang, "pf.automate.admin", "Ticking Automate needs an admin.")}
          onChange={async (e) => {
            setBusy(true); setErr(null);
            const m = await post(ucId, { action: "tick", profile, automate: e.target.checked });
            setBusy(false);
            if (m) setErr(m); else router.refresh();
          }}
        />
        <span>{busy ? tr(lang, "pf.saving", "Saving…") : label}</span>
      </label>
      {err && <p role="alert" className="mt-1 text-xs text-ink"><TV k="pf.err" en="Could not save: {e}" v={{ e: err }} /></p>}
    </div>
  );
}

export function AttachButton({ ucId, sopId, canEdit, className }: { ucId: string; sopId: string; canEdit: boolean; className: string }) {
  const lang = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span>
      <button
        type="button" className={className} disabled={!canEdit || busy}
        title={canEdit ? undefined : tr(lang, "pf.attach.admin", "Attaching a SOP needs an admin.")}
        onClick={async () => {
          setBusy(true); setErr(null);
          const m = await post(ucId, { action: "attach", sop_id: sopId });
          setBusy(false);
          if (m) setErr(m); else router.refresh();
        }}
      >
        <TV k="pf.attach" en="Attach {sop}" v={{ sop: sopId }} />
      </button>
      {err && <span role="alert" className="ms-2 text-xs"><TV k="pf.err" en="Could not save: {e}" v={{ e: err }} /></span>}
    </span>
  );
}
