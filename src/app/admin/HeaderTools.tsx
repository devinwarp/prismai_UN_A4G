"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { useStoredLang } from "@/app/admin/federal/_components/JourneyBar";

interface Info { active: string; countries: { id: string; name: string; ready: boolean; onDemand: boolean }[]; canSwitch: boolean; canManagePeople: boolean }

/** The top-right tools of the admin header: the country switch and People and roles (a small icon). Read from GET /api/admin/un/country;
 * anyone signed in sees the active country, only an admin can switch it (the API refuses anyone else), and only someone who may manage
 * people sees the People icon. If the read fails the tools simply do not show. */
export default function HeaderTools({ country = false }: { /** Show the country switch: the admin dashboard only, not the entity and use-case pages. */ country?: boolean }) {
  const lang = useStoredLang();
  const router = useRouter();
  const [info, setInfo] = useState<Info | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** A country picked whose knowledge base is not built yet: it cannot be switched to until its policy is added. */
  const [setup, setSetup] = useState<{ id: string; name: string } | null>(null);
  const busyRef = useRef(false);
  useEffect(() => {
    let live = true;
    fetch("/api/admin/un/country/summary").then((r) => (r.ok ? r.json() : null)).then((d) => { if (live && d && Array.isArray(d.countries)) setInfo(d as Info); }).catch(() => {});
    return () => { live = false; };
  }, []);
  if (!info || (!country && !info.canManagePeople)) return null;

  async function rerun() {
    if (busyRef.current || !info) return;
    busyRef.current = true; setBusy(true); setError(null); setNote(null);
    try {
      const res = await fetch("/api/admin/un/country", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "run", company: "marsa", country: info.active }) });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || out.ok === false) setError(out.error ?? tr(lang, "gt.failed", "The request failed."));
      else { router.refresh(); setNote(tr(lang, "hdr.reran", "Run again under this country's rules")); setTimeout(() => setNote(null), 6000); }
    } catch { setError(tr(lang, "gt.failed", "The request failed.")); }
    busyRef.current = false; setBusy(false);
  }

  async function change(country: string) {
    if (busyRef.current || !info || country === info.active) return;
    const target = info.countries.find((c) => c.id === country);
    // a country without a knowledge base cannot be switched to: an admin is taken to the country screen, which lists what is required
    if (target && !target.ready) {
      setError(null); setNote(null);
      if (info.canSwitch) router.push(`/admin/federal/country?setup=${encodeURIComponent(target.id)}`);
      else setSetup({ id: target.id, name: target.name });
      return;
    }
    setSetup(null);
    busyRef.current = true; setBusy(true); setError(null); setNote(null);
    try {
      const res = await fetch("/api/admin/un/country", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "switch", country }) });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; reran?: boolean };
      if (!res.ok || out.ok === false) setError(out.error ?? tr(lang, "gt.failed", "The request failed."));
      else {
        setInfo({ ...info, active: country }); router.refresh();
        // the switch re-runs the process only when there was no stored result or its inputs changed: say which happened
        setNote(out.reran ? tr(lang, "hdr.reran", "Run again under this country's rules") : tr(lang, "hdr.reused", "Rules unchanged: stored result shown"));
        setTimeout(() => setNote(null), 6000);
      }
    } catch { setError(tr(lang, "gt.failed", "The request failed.")); }
    busyRef.current = false; setBusy(false);
  }

  const label = tr(lang, "hdr.country", "Country");
  const people = tr(lang, "go.people", "People and roles");
  return (
    <div className="relative flex items-center gap-2">
      {country && <label className="flex items-center gap-1.5 text-ink-soft" title={info.canSwitch ? label : `${label}: ${tr(lang, "cn.readonly", "Read-only: judges and viewers see the stored result and cannot change it.")}`}>
        <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.8 4 5.8 4 9s-1.4 6.2-4 9c-2.6-2.8-4-5.8-4-9s1.4-6.2 4-9z" /></svg>
        <span className="sr-only">{label}</span>
        <select
          value={info.active}
          disabled={!info.canSwitch || busy}
          onChange={(e) => void change(e.target.value)}
          className="max-w-36 rounded-md border border-line bg-paper px-1.5 py-1 text-[13px] text-ink disabled:opacity-70 sm:text-sm"
        >
          {info.countries.map((c) => <option key={c.id} value={c.id}>{c.name}{c.ready ? "" : ` · ${tr(lang, "hdr.setup", "needs setting up")}`}</option>)}
        </select>
      </label>}
      {country && info.canSwitch && (
        <button type="button" onClick={() => void rerun()} disabled={busy} aria-label={tr(lang, "cn.rerun", "Run again now")} title={tr(lang, "cn.rerun", "Run again now")} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink-soft hover:text-ink disabled:opacity-60">
          <svg aria-hidden viewBox="0 0 24 24" className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v4.5h-4.5" /></svg>
        </button>
      )}
      {country && note && !error && <span role="status" className="hidden max-w-56 truncate text-xs text-ink-soft md:inline" title={note}>{note}</span>}
      {country && setup && (
        <div role="status" className="absolute end-0 top-full z-20 mt-2 w-72 rounded-lg border border-line bg-paper p-3 text-sm shadow-lg">
          <p>{tr(lang, "hdr.setup.msg", "{country} has no knowledge base yet, so the process cannot be run under it. Add its policy first; then it can be switched to.").replace("{country}", setup.name)}</p>
          <div className="mt-2 flex items-center gap-3">
            <button type="button" onClick={() => setSetup(null)} className="text-ink-soft underline">{tr(lang, "hdr.setup.close", "Close")}</button>
          </div>
        </div>
      )}
      {country && error && <span role="alert" className="max-w-48 truncate text-xs text-[color:var(--color-v-nogo)]" title={error}>{error}</span>}
      {info.canManagePeople && (
        <Link href="/admin/federal/people" aria-label={people} title={people} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink-soft hover:text-ink">
          <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2" /><path d="M2.8 20c.4-3.4 3-5.2 6.2-5.2s5.8 1.8 6.2 5.2" /><path d="M16 5.2a3 3 0 0 1 0 5.6M17.5 14.9c2.2.5 3.5 2.2 3.7 5.1" /></svg>
        </Link>
      )}
    </div>
  );
}
