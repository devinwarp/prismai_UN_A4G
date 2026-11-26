"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { useLang } from "../_components/Lang";
import { btnPrimary, field } from "../_components/ui";

async function link(entity: string, country: string): Promise<string | undefined> {
  const res = await fetch("/api/admin/un/country", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "link_entity", entity, country }) });
  const result = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  return res.ok && result.ok !== false ? undefined : result.error ?? "The request failed.";
}

export function LinkEntity({ country, entities }: { country: string; entities: string[] }) {
  const router = useRouter();
  const lang = useLang();
  const [entity, setEntity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const message = await link(entity, country);
      if (message) setError(message);
      else { setEntity(""); router.refresh(); }
    } catch { setError(tr(lang, "gt.failed", "The request failed.")); }
    finally { setBusy(false); }
  }
  return <details className="mt-5 rounded-2xl border border-line bg-card p-4">
    <summary className="cursor-pointer font-medium">{tr(lang, "ua.pg.noent.go", "Link an entity to this country")}</summary>
    <form className="mt-3 space-y-2" onSubmit={submit}>
      <label htmlFor="link-country-entity" className="block text-sm">{tr(lang, "goals.entity.move", "Move an existing entity and its use cases to this country")}</label>
      <div className="flex flex-wrap items-center gap-2">
        <select id="link-country-entity" className={field + " !w-auto"} value={entity} onChange={(e) => setEntity(e.target.value)} required>
          <option value="">{tr(lang, "sop.entity.pick", "Choose an entity")}</option>
          {entities.map((name) => <option key={name}>{name}</option>)}
        </select>
        <button className={btnPrimary} disabled={busy || !entity}>{tr(lang, "goals.entity.link", "Link entity")}</button>
      </div>
      {error && <p role="alert" className="text-sm text-ember">{error}</p>}
    </form>
  </details>;
}

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
      const message = await link(entity, next);
      if (message) setError(message);
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
