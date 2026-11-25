"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { MAX_BODY, MAX_TITLE, type MemberRow } from "@/lib/un/entity-admin";
import type { Person } from "@/lib/un/roles-store";
import { useLang } from "../_components/Lang";
import { btnGhost, btnPrimary, field } from "../_components/ui";
import { fill } from "../_components/labels";

async function post(url: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: res.ok, error: j.error };
  } catch { return { ok: false, error: "The request failed." }; }
}

/** Each person's job title, the entities they work at, and the federal bodies they belong to.
 *  - an entity's people are not stored: a person works at an entity when they hold a role on one of its use cases, so "give a role at an entity" is how someone is added;
 *  - a federal member is someone above any one entity (the federal central authority, the president's office) who holds platform-wide roles.
 * Changing anything needs the users.manage permission (the API checks); without it this is a read-only list. */
export function PeopleEntities({ person, federal, entities, may, me }: {
  person: Person; federal: MemberRow[]; entities: string[]; may: boolean; me: string;
}) {
  const lang = useLang();
  const router = useRouter();
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [body, setBody] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(key: string, url: string, b: Record<string, unknown>, after?: () => void) {
    setBusy(key); setMsg(null);
    const r = await post(url, b);
    setBusy(null);
    if (r.ok) { setMsg({ ok: true, text: tr(lang, "en.saved", "Saved.") }); after?.(); router.refresh(); } else setMsg({ ok: false, text: r.error ?? tr(lang, "gt.failed", "The request failed.") });
  }
  const p = person;
  const mine = federal.filter((m) => !m.removed_at && m.user_id === p.id);
  const works = entities;
  const t = titles[p.id] ?? p.job_title ?? "";
  const dirty = t.trim() !== (p.job_title ?? "");
  return (
    <section aria-labelledby="pm-h" data-testid="people-entities">
      <h2 id="pm-h" className="font-display text-xl font-medium">{tr(lang, "pe.profile.membership", "Profile and membership")}</h2>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm ${msg.ok ? "text-lit-deep" : "text-ember"}`}>{msg.ok ? "✓" : "✕"} {msg.text}</p>}
      <div className="mt-3 grid gap-3">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label className="block text-xs font-medium" htmlFor={`jt-${p.id}`}>{tr(lang, "pm.title", "Job title")}</label>
          <input id={`jt-${p.id}`} className={field} value={t} maxLength={MAX_TITLE} disabled={!may} onChange={(e) => setTitles({ ...titles, [p.id]: e.target.value })} />
        </div>
        {may && <button type="button" className={btnGhost} disabled={!dirty || busy === `t-${p.id}`} onClick={() => void run(`t-${p.id}`, "/api/admin/un/people", { action: "set_job_title", user_id: p.id, job_title: t })}>{tr(lang, "pm.title.save", "Save title")}</button>}
      </div>
      <div className="space-y-3">
        <div>
        <p className="text-xs font-medium">{tr(lang, "pe.assigned.entities", "Entities from assigned use cases")}</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {works.map((e) => <li key={e} className="rounded-full border border-line bg-paper px-2.5 py-1 text-xs" dir="auto">{e}</li>)}
            {!works.length && <li className="text-xs text-ink-soft">{tr(lang, "pm.none", "Not in any entity")}</li>}
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium">{tr(lang, "pm.fed", "Federal bodies")}</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {mine.map((m) => (
              <li key={m.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 py-1 text-xs" dir="auto">
                {m.body}
                {may && p.id !== me && <button type="button" aria-label={fill(tr(lang, "pm.remove", "Remove from {e}"), { e: m.body })} disabled={busy === m.id} className="text-ink-soft hover:text-ember" onClick={() => void run(m.id, "/api/admin/un/people", { action: "remove_federal", member_id: m.id })}>✕</button>}
              </li>
            ))}
            {!mine.length && <li className="text-xs text-ink-soft">{tr(lang, "pm.fed.none", "Not in a federal body")}</li>}
          </ul>
          {may && p.id !== me && (
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <label className="sr-only" htmlFor={`fb-${p.id}`}>{tr(lang, "pm.fed.add", "Add to a federal body")}</label>
              <input id={`fb-${p.id}`} className={`${field} mt-0 w-56 py-1 text-xs`} value={body[p.id] ?? ""} maxLength={MAX_BODY} placeholder={tr(lang, "pm.fed.ph", "For example, Federal Central Authority")} onChange={(e) => setBody({ ...body, [p.id]: e.target.value })} />
              <button type="button" className={btnPrimary} disabled={(body[p.id] ?? "").trim().length < 2 || busy === `a-${p.id}`} onClick={() => void run(`a-${p.id}`, "/api/admin/un/people", { action: "add_federal", body: body[p.id], user_id: p.id }, () => setBody((x) => ({ ...x, [p.id]: "" })))}>{tr(lang, "pm.add.btn", "Add")}</button>
            </div>
          )}
        </div>
      </div>
      </div>
    </section>
  );
}
