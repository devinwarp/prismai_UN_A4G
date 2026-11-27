"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { useLang } from "../_components/Lang";
import { btnPrimary, field } from "../_components/ui";

/** Appoint the country's governance admin: the person who approves its process targets and test sets. Uses the same roles route as the People
 * screen, so the same rules apply (nobody changes their own roles, and only an administrator may grant it). */
export default function GovernanceAdmin({ country, countryName, people, canEdit, appointed }: {
  country: string; countryName: string; people: { id: string; label: string }[]; canEdit: boolean; appointed: boolean;
}) {
  const lang = useLang();
  const router = useRouter();
  const [person, setPerson] = useState(people[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function appoint() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/admin/un/roles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "grant", user_id: person, role: "governance_admin", country }) }).catch(() => null);
    const d = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    setBusy(false);
    if (res?.ok) { setMsg({ ok: true, text: tr(lang, "en.saved", "Saved.") }); router.refresh(); }
    else setMsg({ ok: false, text: d?.error ?? tr(lang, "gt.failed", "The request failed.") });
  }
  return (
    <div className="rounded-lg border border-line p-3">
      <h3 className="text-base font-medium">{tr(lang, "su.gov.h", "Governance admin")}</h3>
      <p className="mt-1 max-w-[68ch] text-sm text-ink-soft">
        {appointed ? tr(lang, "su.gov.ok", "A governance admin is appointed for this country. They approve its process targets and test sets.") : tr(lang, "su.gov.need", "Appoint a governance admin for this country. Process targets and test sets cannot be approved until one is.")}
        {" "}<bdi dir="ltr" className="font-mono text-xs">{countryName}</bdi>
      </p>
      {canEdit ? (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="min-w-0 text-sm font-medium">
            {tr(lang, "su.gov.person", "Person")}
            <select className={`${field} max-w-full`} value={person} onChange={(e) => setPerson(e.target.value)}>
              {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <button type="button" className={btnPrimary} disabled={busy || !person} onClick={() => void appoint()}>{appointed ? tr(lang, "su.gov.add", "Appoint another") : tr(lang, "su.gov.btn", "Appoint governance admin")}</button>
          {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-lit-deep" : "text-ember"}`}>{msg.ok ? "✓" : "✕"} {msg.text}</p>}
        </div>
      ) : <p className="mt-2 text-sm text-ink-soft">{tr(lang, "su.readonly", "Read only: setting this up needs an administrator.")}</p>}
    </div>
  );
}
