"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { useStoredLang } from "@/app/admin/federal/_components/JourneyBar";

interface Info { active: string; countries: { id: string; name: string; ready: boolean; onDemand: boolean }[]; canSwitch: boolean; canBrowse: boolean; canViewPeople: boolean }

/** The top-right tools of the admin header: the country switch and People and roles (a small icon). Read from GET /api/admin/un/country;
 * anyone signed in sees the active country, only an admin can switch it (the API refuses anyone else), and only someone who may manage
 * people sees the People icon. If the read fails the tools simply do not show. */
export default function HeaderTools({ country = false, previewCountry }: { /** Show the country switch: the admin dashboard only, not the entity and use-case pages. */ country?: boolean; previewCountry?: string }) {
  const lang = useStoredLang();
  const router = useRouter();
  const [info, setInfo] = useState<Info | null>(null);
  // what needs this person in the inbox: the count on the bell (read only; opening the inbox is what makes anything happen)
  const [inbox, setInbox] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const busyRef = useRef(false);
  useEffect(() => {
    let live = true;
    fetch("/api/admin/un/country/summary").then((r) => (r.ok ? r.json() : null)).then((d) => { if (live && d && Array.isArray(d.countries)) setInfo(d as Info); }).catch(() => {});
    fetch("/api/admin/un/inbox?summary=1").then((r) => (r.ok ? r.json() : null)).then((d) => { if (live && d?.counts) setInbox(Number(d.counts.todo) + Number(d.counts.info)); }).catch(() => {});
    return () => { live = false; };
  }, []);
  if (!info || (!country && !info.canViewPeople)) return null;

  async function rerun() {
    if (busyRef.current || !info || previewCountry) return;
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
    if (busyRef.current || !info || country === (previewCountry ?? info.active)) return;
    const target = info.countries.find((c) => c.id === country);
    if (!target || !info.canBrowse) return;
    if (!info.canSwitch) {
      router.push(`/admin/federal?country=${encodeURIComponent(country)}`);
      return;
    }
    if (!target.ready || country === info.active) {
      setError(null); setNote(null);
      router.push(target.ready ? "/admin/federal" : `/admin/federal?country=${encodeURIComponent(country)}`);
      return;
    }
    busyRef.current = true; setBusy(true); setError(null); setNote(null);
    try {
      const res = await fetch("/api/admin/un/country", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "switch", country }) });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; reran?: boolean };
      if (!res.ok || out.ok === false) setError(out.error ?? tr(lang, "gt.failed", "The request failed."));
      else {
        setInfo({ ...info, active: country });
        if (previewCountry) router.push("/admin/federal");
        else router.refresh();
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
    <div data-tour={country ? "header" : undefined} className="relative flex items-center gap-2">
      {country && info.countries.length > 0 && <label className="flex items-center gap-1.5 text-ink-soft" title={info.canBrowse ? label : `${label}: ${tr(lang, "cn.readonly", "Read-only: judges and viewers see the stored result and cannot change it.")}`}>
        <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.8 4 5.8 4 9s-1.4 6.2-4 9c-2.6-2.8-4-5.8-4-9s1.4-6.2 4-9z" /></svg>
        <span className="sr-only">{label}</span>
        <select
          value={previewCountry ?? info.active}
          disabled={!info.canBrowse || busy}
          onChange={(e) => void change(e.target.value)}
          className="max-w-36 rounded-md border border-line bg-paper px-1.5 py-1 text-[13px] text-ink disabled:opacity-70 sm:text-sm"
        >
          {info.countries.map((c) => <option key={c.id} value={c.id}>{c.name}{c.ready ? "" : ` · ${tr(lang, "hdr.setup", "needs setting up")}`}</option>)}
        </select>
      </label>}
      {country && info.canSwitch && (
        <button type="button" onClick={() => void rerun()} disabled={busy || !!previewCountry} aria-label={tr(lang, "cn.rerun", "Run again now")} title={tr(lang, "cn.rerun", "Run again now")} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink-soft hover:text-ink disabled:opacity-60">
          <svg aria-hidden viewBox="0 0 24 24" className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v4.5h-4.5" /></svg>
        </button>
      )}
      {country && note && !error && <span role="status" className="hidden max-w-56 truncate text-xs text-ink-soft md:inline" title={note}>{note}</span>}
      {country && error && <span role="alert" className="max-w-48 truncate text-xs text-[color:var(--color-v-nogo)]" title={error}>{error}</span>}
      {inbox !== null && (
        <Link href="/admin/federal/inbox" aria-label={inbox > 0 ? tr(lang, "ib.bell.n", "Inbox: {n} need you").replace("{n}", String(inbox)) : tr(lang, "ib.bell", "Inbox")} title={tr(lang, "ib.bell", "Inbox")} className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink-soft hover:text-ink">
          <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></svg>
          {inbox > 0 && <span aria-hidden className="absolute -end-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-lit-deep px-1 font-mono text-[10px] leading-4 text-paper">{inbox > 99 ? "99+" : inbox}</span>}
        </Link>
      )}
      {info.canViewPeople && (
        <Link href="/admin/federal/people" aria-label={people} title={people} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink-soft hover:text-ink">
          <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2" /><path d="M2.8 20c.4-3.4 3-5.2 6.2-5.2s5.8 1.8 6.2 5.2" /><path d="M16 5.2a3 3 0 0 1 0 5.6M17.5 14.9c2.2.5 3.5 2.2 3.7 5.1" /></svg>
        </Link>
      )}
    </div>
  );
}
