"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { useLang } from "../_components/Lang";
import { field } from "../_components/ui";

/** The country an entity is linked to. Its use cases are counted on that country's dashboard and no other. Only an admin can change it. */
export function EntityCountry({ entity, country, countries, canEdit }: { entity: string; country: string; countries: { id: string; name: string }[]; canEdit: boolean }) {
  const lang = useLang();
  const router = useRouter();
  const [value, setValue] = useState(country);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = countries.find((c) => c.id === country)?.name ?? country;
  if (!canEdit) return <span>{name}</span>;
  async function change(next: string) {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/admin/un/country", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "link_entity", entity, country: next }) });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || out.ok === false) setError(out.error ?? tr(lang, "gt.failed", "The request failed."));
      else { setValue(next); router.refresh(); }
    } catch { setError(tr(lang, "gt.failed", "The request failed.")); }
    setBusy(false);
  }
  return (
    <span className="inline-flex items-center gap-2">
      <select aria-label={`${tr(lang, "gl.country", "Country")}: ${entity}`} className={`${field} !w-auto !py-1 text-sm`} value={value} disabled={busy} onChange={(e) => void change(e.target.value)}>
        {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {error && <span role="alert" className="text-xs text-[color:var(--color-v-nogo)]">{error}</span>}
    </span>
  );
}
