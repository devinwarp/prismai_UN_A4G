"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { ROLES } from "@/lib/un/authz";
import { ORG_ONLY, type AssignmentRow } from "@/lib/un/role-admin";
import type { Person } from "@/lib/un/roles-store";
import { useLang } from "../_components/Lang";
import { fill } from "../_components/labels";
import { btnPrimary, field } from "../_components/ui";

type UseCase = { id: string; ext_id: string; title: string; country: string; entity: string };

/** Roles of each person, a form to grant one, and a revoke button. The server enforces every rule; the form only
 * hides what the person may not do. */
export function PeopleRoles({ person, people, rows, useCases, may, me, caseOwners }: {
  person: Person; people: Person[]; rows: AssignmentRow[]; useCases: UseCase[]; may: boolean; me: string; caseOwners: AssignmentRow[];
}) {
  const lang = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const p = person;
  const user = p.id;
  const live = rows.filter((r) => !r.revoked_at);
  const past = rows.filter((r) => r.revoked_at);
  const [role, setRole] = useState<string>("process_owner");
  const [scope, setScope] = useState<string | undefined>();
  const [replacing, setReplacing] = useState<string | null>(null);
  const [successor, setSuccessor] = useState("");

  const send = async (body: object) => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/admin/un/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setError(d.error ?? tr(lang, "gt.failed", "The request failed.")); return false; }
      router.refresh();
      return true;
    } catch { setError(tr(lang, "gt.failed", "The request failed.")); return false; }
    finally { setBusy(false); }
  };
  const ucName = (id: string | null) => (id ? (useCases.find((u) => u.id === id)?.ext_id ?? id) : tr(lang, "pe.org", "Whole organisation"));
  const orgOnly = (ORG_ONLY as readonly string[]).includes(role);
  const owner = role === "process_owner" && scope ? caseOwners.find((r) => r.use_case_id === scope) : undefined;
  const current = people.find((person) => person.id === owner?.user_id);
  const ownerName = current?.full_name || current?.email || tr(lang, "pe.current_owner", "the current owner");

  return (
    <div className="min-w-0">
      <section aria-labelledby="pe-people">
        <h2 id="pe-people" className="font-display text-xl font-medium">{tr(lang, "pe.assigned", "Role assignments")}</h2>
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
                    <button type="button" className="underline" disabled={busy || !successor} onClick={() => send({ action: "replace_process_owner", assignment_id: r.id, user_id: successor }).then((ok) => { if (ok) { setReplacing(null); setSuccessor(""); } })}>{tr(lang, "pe.replace.go", "Replace")}</button>
                  </span>
                ) : <button type="button" className="underline" disabled={busy} aria-label={`${tr(lang, "pe.replace", "Replace")} ${p.email ?? ""}`} onClick={() => { setReplacing(r.id); setSuccessor(""); }}>{tr(lang, "pe.replace", "Replace")}</button>
              )}
              {may && p.id !== me && r.role !== "process_owner" && <button type="button" className="underline" disabled={busy} aria-label={`${tr(lang, "pe.revoke", "Revoke")} ${r.role} ${p.email ?? ""}`} onClick={() => send({ action: "revoke", assignment_id: r.id })}>{tr(lang, "pe.revoke", "Revoke")}</button>}
            </li>
          ))}
        </ul>
      )}
      {past.length > 0 && <p className="mt-2 text-[11px] text-ink-soft">{tr(lang, "pe.history", "Revoked")}: {past.map((r) => `${r.role} (${ucName(r.use_case_id)}, ${new Date(r.revoked_at!).toLocaleDateString("en-GB")})`).join(", ")}</p>}
      </section>

      {may && user !== me && (
        <section className="mt-5 border-t border-line pt-4" aria-labelledby="pe-grant">
          <h2 id="pe-grant" className="font-display text-xl font-medium">{tr(lang, "pe.grant", "Give a role")}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm" htmlFor="pe-role">{tr(lang, "pe.role", "Role")}</label>
              <select id="pe-role" className={field} value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.map((r) => <option key={r} value={r}>{r.replaceAll("_", " ")}</option>)}</select>
            </div>
            <div>
              <label className="block text-sm" htmlFor="pe-scope">{tr(lang, "pe.scope", "Held for")}</label>
              <select id="pe-scope" className={field} value={orgOnly ? "" : scope ?? "choose"} disabled={orgOnly} onChange={(e) => setScope(e.target.value)}>
                <option value="choose" disabled>{tr(lang, "pe.choose.scope", "Choose a scope")}</option>
                <option value="">{tr(lang, "pe.org", "Whole organisation")}</option>
                {useCases.map((u) => <option key={u.id} value={u.id}>{u.ext_id} · {u.title} ({u.entity}, {u.country})</option>)}
              </select>
            </div>
          </div>
          {owner ? (
            <div className="mt-3 space-y-2">
              {owner.user_id === user ? <p className="text-sm text-ink-soft">{tr(lang, "pe.owner_already", "This person already owns the selected use case.")}</p>
                : owner.user_id === me ? <p className="text-sm text-ink-soft">{tr(lang, "pe.owner_self", "Ask another administrator to transfer a use case you own.")}</p>
                : <>
                  <p className="text-sm text-ink-soft">{fill(tr(lang, "pe.owner_transfer", "This transfers ownership from {owner} to {successor}."), { owner: ownerName, successor: p.full_name || p.email || p.id })}</p>
                  <button type="button" className={btnPrimary} disabled={busy} onClick={() => send({ action: "replace_process_owner", assignment_id: owner.id, user_id: user })}>{tr(lang, "pe.owner_replace", "Replace process owner")}</button>
                </>}
            </div>
          ) : <button type="button" className={`${btnPrimary} mt-3`} disabled={busy || (!orgOnly && scope === undefined)} onClick={() => send({ action: "grant", user_id: user, role, use_case_id: orgOnly ? undefined : scope || undefined })}>{tr(lang, "pe.give", "Give this role")}</button>}
        </section>
      )}

      {error && <p role="alert" className="mt-2 text-sm text-ember">{error}</p>}
    </div>
  );
}
