"use client";

import { useEffect, useState } from "react";

interface Person { id: string; email: string | null; name: string | null; job_title: string | null; legacy_role: string | null; roles: string[] }

/** Offline only (the banner renders it only then): choose which person of the local store you are signed in as, to try each role and what it can do. */
export default function OfflineAs() {
  const [people, setPeople] = useState<Person[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/offline/as").then((r) => (r.ok ? r.json() : { people: [] })).then((d) => live && setPeople(d.people ?? [])).catch(() => {});
    return () => { live = false; };
  }, []);

  async function pick(id: string) {
    setBusy(true);
    await fetch("/api/offline/as", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: id || null }) });
    window.location.href = "/admin/federal";
  }

  if (people.length < 2) return null;
  return (
    <label className="ms-3 inline-flex items-center gap-2 text-ember">
      <span>Sign in as</span>
      <select disabled={busy} defaultValue="" onChange={(e) => void pick(e.target.value)} className="max-w-72 rounded border border-ember/40 bg-paper px-1.5 py-0.5 text-ink">
        <option value="">Offline admin (default)</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {(p.name ?? p.email ?? p.id)}{p.job_title ? ` · ${p.job_title}` : ""} [{[p.legacy_role, ...p.roles].filter(Boolean).join(", ")}]
          </option>
        ))}
      </select>
    </label>
  );
}
