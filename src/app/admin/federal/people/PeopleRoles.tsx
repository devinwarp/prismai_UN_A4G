"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr } from "@/lib/un/i18n/dict";
import { ROLES, type RoleId } from "@/lib/un/authz";
import { ENTITY_GRANTABLE, ROLE_SCOPES, type AssignmentRow } from "@/lib/un/role-admin";
import type { Person } from "@/lib/un/roles-store";
import { useLang } from "../_components/Lang";
import { fill } from "../_components/labels";
import { btnPrimary, field } from "../_components/ui";

type UseCase = { id: string; ext_id: string; title: string; country: string; entity: string };
export type RoleScopes = { countries: { id: string; name: string }[]; entities: { name: string; country_id: string; country: string }[] };

/** Roles of each person, a form to grant one, and a revoke button. The server enforces every rule; the form only
 * hides what the person may not do. */
export function PeopleRoles({ person, people, rows, useCases, may, me, caseOwners, entityAdminOf = [], scopes = { countries: [], entities: [] } }: {
  person: Person; people: Person[]; rows: AssignmentRow[]; useCases: UseCase[]; may: boolean; me: string; caseOwners: AssignmentRow[];
  /** the entities this person administers, when they are an entity admin rather than an administrator */
  entityAdminOf?: string[];
  scopes?: RoleScopes;
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
  // an administrator gives any role anywhere; an entity admin gives process owner, test author and operator roles for their own entity only
  const mayGrant = may || entityAdminOf.length > 0;
  const roleChoices: readonly string[] = may ? ROLES : ENTITY_GRANTABLE;
  const ucName = (id: string | null) => (id ? (useCases.find((u) => u.id === id)?.ext_id ?? id) : tr(lang, "pe.org", "Whole organisation"));
  /** where a role is held, in words: a use case, an entity (in its country), a country, or the whole organisation */
  const heldFor = (r: AssignmentRow) => r.use_case_id ? ucName(r.use_case_id)
    : r.scope_entity ? `${tr(lang, "pe.entity", "Entity")}: ${r.scope_entity}${r.scope_country ? ` (${r.scope_country})` : ""}`
      : r.scope_country ? `${tr(lang, "pe.country", "Country")}: ${r.scope_country}` : tr(lang, "pe.org", "Whole organisation");
  /** the choices for "Held for", by the scopes the chosen role may have. The value says the kind: o (organisation), c:<country id>, e:<entity>, u:<use case id>. */
  const kinds = ROLE_SCOPES[role as RoleId] ?? [];
  const options: { value: string; label: string }[] = [
    ...(kinds.includes("org") && may ? [{ value: "o", label: tr(lang, "pe.org", "Whole organisation") }] : []),
    ...(kinds.includes("country") && may ? scopes.countries.map((c) => ({ value: `c:${c.id}`, label: `${tr(lang, "pe.country", "Country")}: ${c.name}` })) : []),
    ...(kinds.includes("entity") ? scopes.entities.map((e) => ({ value: `e:${e.name}`, label: `${tr(lang, "pe.entity", "Entity")}: ${e.name} (${e.country})` })) : []),
    ...(kinds.includes("use_case") ? useCases.map((u) => ({ value: `u:${u.id}`, label: `${u.ext_id} · ${u.title} (${u.entity}, ${u.country})` })) : []),
  ];
  const chosen = options.some((o) => o.value === scope) ? scope : undefined;
  const scopeBody = (): object => {
    if (!chosen || chosen === "o") return {};
    if (chosen.startsWith("c:")) return { country: chosen.slice(2) };
    if (chosen.startsWith("e:")) return { entity: chosen.slice(2) };
    return { use_case_id: chosen.slice(2) };
  };
  const ownEntity = (r: AssignmentRow) => may || (r.scope_entity ? entityAdminOf.includes(r.scope_entity) : !!r.use_case_id && useCases.some((u) => u.id === r.use_case_id));
  const mayRevoke = (r: AssignmentRow) => p.id !== me && r.role !== "process_owner" && (may || ((ENTITY_GRANTABLE as readonly string[]).includes(r.role) && ownEntity(r)));
  const owner = role === "process_owner" && chosen?.startsWith("u:") ? caseOwners.find((r) => r.use_case_id === chosen.slice(2)) : undefined;
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
              <span className="font-medium">{r.role.replaceAll("_", " ")}</span><span className="text-ink-soft">{heldFor(r)}</span>
              {mayGrant && p.id !== me && r.role === "process_owner" && ownEntity(r) && (
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
              {mayRevoke(r) && <button type="button" className="underline" disabled={busy} aria-label={`${tr(lang, "pe.revoke", "Revoke")} ${r.role} ${p.email ?? ""}`} onClick={() => send({ action: "revoke", assignment_id: r.id })}>{tr(lang, "pe.revoke", "Revoke")}</button>}
            </li>
          ))}
        </ul>
      )}
      {past.length > 0 && <p className="mt-2 text-[11px] text-ink-soft">{tr(lang, "pe.history", "Revoked")}: {past.map((r) => `${r.role} (${heldFor(r)}, ${new Date(r.revoked_at!).toLocaleDateString("en-GB")})`).join(", ")}</p>}
      </section>

      {mayGrant && user !== me && (
        <section className="mt-5 border-t border-line pt-4" aria-labelledby="pe-grant">
          <h2 id="pe-grant" className="font-display text-xl font-medium">{tr(lang, "pe.grant", "Give a role")}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm" htmlFor="pe-role">{tr(lang, "pe.role", "Role")}</label>
              <select id="pe-role" className={field} value={role} onChange={(e) => { setRole(e.target.value); setScope(undefined); }}>{roleChoices.map((r) => <option key={r} value={r}>{r.replaceAll("_", " ")}</option>)}</select>
            </div>
            <div>
              <label className="block text-sm" htmlFor="pe-scope">{tr(lang, "pe.scope", "Held for")}</label>
              <select id="pe-scope" className={field} value={chosen ?? "choose"} onChange={(e) => setScope(e.target.value)}>
                <option value="choose" disabled>{tr(lang, "pe.choose.scope", "Choose a scope")}</option>
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
          ) : <button type="button" className={`${btnPrimary} mt-3`} disabled={busy || !chosen} onClick={() => send({ action: "grant", user_id: user, role, ...scopeBody() })}>{tr(lang, "pe.give", "Give this role")}</button>}
        </section>
      )}

      {error && <p role="alert" className="mt-2 text-sm text-ember">{error}</p>}
    </div>
  );
}
