"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { ROLES } from "@/lib/un/authz";
import { ORG_ONLY, type AssignmentRow } from "@/lib/un/role-admin";
import type { Person } from "@/lib/un/roles-store";
import { useLang } from "../_components/Lang";
import { btnPrimary, card, field } from "../_components/ui";

type UseCase = { id: string; ext_id: string; title: string };

/** Roles of each person, a form to grant one, and a revoke button. The server enforces every rule; the form only
 * hides what the person may not do. */
export function PeopleRoles({ people, rows, useCases, what, may, me }: {
  people: Person[]; rows: AssignmentRow[]; useCases: UseCase[]; what: { role: string; actions: { id: string; label: string }[] }[]; may: boolean; me: string;
}) {
  const lang = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState(people.find((p) => p.id !== me)?.id ?? "");
  const [role, setRole] = useState<string>("process_owner");
  const [scope, setScope] = useState("");
  const [replacing, setReplacing] = useState<string | null>(null);
  const [successor, setSuccessor] = useState("");

  const send = async (body: object) => {
    setBusy(true); setError(null);
    const res = await fetch("/api/admin/un/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "The request failed."); return; }
    router.refresh();
  };
  const ucName = (id: string | null) => (id ? (useCases.find((u) => u.id === id)?.ext_id ?? id) : tr(lang, "pe.org", "Whole organisation"));
  const orgOnly = (ORG_ONLY as readonly string[]).includes(role);

  return (
    <>
      <section className={`${card} mt-6`} aria-labelledby="pe-people">
        <h2 id="pe-people" className="font-display text-xl font-medium">{tr(lang, "pe.people", "People")} ({people.length})</h2>
        <ul className="mt-3 space-y-3">
          {people.map((p) => {
            const mine = rows.filter((r) => r.user_id === p.id);
            const live = mine.filter((r) => !r.revoked_at);
            const past = mine.filter((r) => r.revoked_at);
            return (
              <li key={p.id} className="rounded-xl border border-line p-3">
                <p className="text-sm font-medium">{p.email ?? p.id}{p.id === me ? ` (${tr(lang, "pe.you", "you")})` : ""}</p>
                <p className="text-xs text-ink-soft">{p.job_title ?? tr(lang, "pe.notitle", "No job title")}{p.legacy_role === "admin" ? ` · ${tr(lang, "pe.legacyadmin", "administrator on the profile: every role")}` : p.legacy_role === "viewer" ? ` · ${tr(lang, "pe.legacyviewer", "viewer on the profile: read only")}` : ""}</p>
                {live.length === 0 ? <p className="mt-1 text-xs text-ink-soft">{tr(lang, "pe.noroles", "No assigned roles")}</p> : (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {live.map((r) => (
                      <li key={r.id} className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs">
                        <span className="font-medium">{r.role}</span><span className="text-ink-soft">{ucName(r.use_case_id)}</span>
                        {may && p.id !== me && r.role === "process_owner" && (
                          replacing === r.id ? (
                            <span className="inline-flex items-center gap-1">
                              <label className="sr-only" htmlFor={`pe-succ-${r.id}`}>{tr(lang, "pe.successor", "New process owner")}</label>
                              <select id={`pe-succ-${r.id}`} className={field} value={successor} onChange={(e) => setSuccessor(e.target.value)}>
                                <option value="">{tr(lang, "pe.choose", "Choose a person")}</option>
                                {people.filter((x) => x.id !== p.id && x.id !== me).map((x) => <option key={x.id} value={x.id}>{x.email ?? x.id}</option>)}
                              </select>
                              <button type="button" className="underline" disabled={busy || !successor} onClick={() => send({ action: "replace_process_owner", assignment_id: r.id, user_id: successor }).then(() => { setReplacing(null); setSuccessor(""); })}>{tr(lang, "pe.replace.go", "Replace")}</button>
                            </span>
                          ) : <button type="button" className="underline" disabled={busy} aria-label={`${tr(lang, "pe.replace", "Replace")} ${p.email ?? ""}`} onClick={() => { setReplacing(r.id); setSuccessor(""); }}>{tr(lang, "pe.replace", "Replace")}</button>
                        )}
                        {may && p.id !== me && r.role !== "process_owner" && <button type="button" className="underline" disabled={busy} aria-label={`${tr(lang, "pe.revoke", "Revoke")} ${r.role} ${p.email ?? ""}`} onClick={() => send({ action: "revoke", assignment_id: r.id })}>{tr(lang, "pe.revoke", "Revoke")}</button>}
                      </li>
                    ))}
                  </ul>
                )}
                {past.length > 0 && <p className="mt-2 text-[11px] text-ink-soft">{tr(lang, "pe.history", "Revoked")}: {past.map((r) => `${r.role} (${ucName(r.use_case_id)}, ${new Date(r.revoked_at!).toLocaleDateString("en-GB")})`).join(", ")}</p>}
              </li>
            );
          })}
        </ul>
      </section>

      {may && (
        <section className={`${card} mt-6`} aria-labelledby="pe-grant">
          <h2 id="pe-grant" className="font-display text-xl font-medium">{tr(lang, "pe.grant", "Give a role")}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-sm" htmlFor="pe-user">{tr(lang, "pe.person", "Person")}</label>
              <select id="pe-user" className={field} value={user} onChange={(e) => setUser(e.target.value)}>{people.filter((p) => p.id !== me).map((p) => <option key={p.id} value={p.id}>{p.email ?? p.id}</option>)}</select>
            </div>
            <div>
              <label className="block text-sm" htmlFor="pe-role">{tr(lang, "pe.role", "Role")}</label>
              <select id="pe-role" className={field} value={role} onChange={(e) => { setRole(e.target.value); if ((ORG_ONLY as readonly string[]).includes(e.target.value)) setScope(""); }}>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select>
            </div>
            <div>
              <label className="block text-sm" htmlFor="pe-scope">{tr(lang, "pe.scope", "Held for")}</label>
              <select id="pe-scope" className={field} value={scope} disabled={orgOnly} onChange={(e) => setScope(e.target.value)}>
                <option value="">{tr(lang, "pe.org", "Whole organisation")}</option>
                {useCases.map((u) => <option key={u.id} value={u.id}>{u.ext_id} · {u.title}</option>)}
              </select>
            </div>
          </div>
          <button type="button" className={`${btnPrimary} mt-3`} disabled={busy || !user} onClick={() => send({ action: "grant", user_id: user, role, use_case_id: scope || undefined })}>{tr(lang, "pe.give", "Give this role")}</button>
          {people.filter((p) => p.id !== me).length === 0 && <p className="mt-2 text-sm text-ink-soft">{tr(lang, "pe.alone", "There is no one else in this organisation to give a role to.")}</p>}
          {error && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--color-v-nogo)" }}>{error}</p>}
        </section>
      )}

      <section className={`${card} mt-6`} aria-labelledby="pe-what">
        <h2 id="pe-what" className="font-display text-xl font-medium">{tr(lang, "pe.what", "What each role can do")}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {what.map((w) => (
            <div key={w.role} className="rounded-xl border border-line p-3">
              <p className="font-mono text-xs">{w.role}</p>
              <ul className="mt-1 list-disc ps-5 text-xs text-ink-soft">{w.actions.map((a) => <li key={a.id}>{a.label}</li>)}</ul>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
