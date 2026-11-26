"use client";

import { useState } from "react";
import { ACTIONS, ROLES } from "@/lib/un/authz";
import type { MemberRow } from "@/lib/un/entity-admin";
import type { AssignmentRow } from "@/lib/un/role-admin";
import type { Person } from "@/lib/un/roles-store";
import { tr } from "@/lib/un/i18n/dict";
import { useLang } from "../_components/Lang";
import { field, scrollRegion } from "../_components/ui";
import { PeopleEntities } from "./PeopleEntities";
import { AgentSwitch } from "./AgentSwitch";
import { PeopleRoles, type RoleScopes } from "./PeopleRoles";

type UseCase = { id: string; ext_id: string; title: string; entity: string; country: string };

const scopeGuide = [
  ["super", "Super user", "Cross-country comparison and organisation-wide oversight."],
  ["federal", "Federal member", "Federal dashboard and its entities. Assigned roles govern actions."],
  ["country", "Country administrator", "Manage the policy and rules of an assigned country."],
  ["entity", "Entity administrator", "Manage the entity’s use cases, SOPs, and reruns."],
  ["case", "Use-case team", "Work on assigned use cases and their job profiles."],
] as const;

export default function PeopleDashboard({ people, federal, rows, useCases, me, may, superUserId, entityAdminOf = [], scopes }: {
  people: Person[]; federal: MemberRow[]; rows: AssignmentRow[]; useCases: UseCase[]; me: string; may: boolean; superUserId?: string;
  /** the entities this person administers (an entity admin, who may give roles for their own entity) */
  entityAdminOf?: string[];
  scopes?: RoleScopes;
}) {
  const lang = useLang();
  const t = (key: string, english: string) => tr(lang, key, english);
  const [selected, setSelected] = useState(me);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const memberships = new Set(federal.filter((row) => !row.removed_at).map((row) => row.user_id));
  const matches = query.trim().toLocaleLowerCase();
  const visible = people.filter((p) => (filter === "all" || memberships.has(p.id) === (filter === "federal"))
    && `${p.full_name ?? ""} ${p.email ?? ""} ${p.job_title ?? ""}`.toLocaleLowerCase().includes(matches));
  const person = visible.find((p) => p.id === selected) ?? visible[0];
  const personRows = rows.filter((row) => row.user_id === person?.id);
  const assigned = new Set(personRows.filter((row) => !row.revoked_at).map((row) => row.use_case_id));
  const entities = [...new Set(useCases.filter((uc) => assigned.has(uc.id)).map((uc) => uc.entity))].sort();
  const name = (p: Person) => p.full_name || p.email || p.id;
  const access = person?.id === superUserId && person ? t("pe.scope.super", "Super user")
    : person?.legacy_role === "platform" || person?.legacy_role === "admin" ? t("pe.admin", "Organisation administrator")
    : person && memberships.has(person.id) ? t("pe.federal.single", "Federal member") : null;

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(16rem,1fr)_minmax(0,2.5fr)] desk:min-h-0 desk:flex-1">
      <section aria-labelledby="pe-directory" className="flex min-w-0 flex-col rounded-xl border border-line bg-card desk:min-h-0">
        <div className="shrink-0 space-y-3 border-b border-line p-4">
          <h2 id="pe-directory" className="font-display text-xl font-medium">{t("pe.people", "People")} <span className="text-sm text-ink-soft">{visible.length}</span></h2>
          <label className="block text-sm" htmlFor="pe-query">{t("pe.search", "Search name, email, or title")}</label>
          <input id="pe-query" className={field} value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
          {memberships.size > 0 && <select aria-label={t("pe.group", "Membership filter")} className={field} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">{t("pe.everyone", "Everyone")}</option>
            <option value="federal">{t("pe.member", "Federal members")}</option>
            <option value="other">{t("pe.other", "Other profiles")}</option>
          </select>}
        </div>
        <div {...scrollRegion("pe-directory")} className="max-h-64 min-w-0 overflow-auto p-2 lg:max-h-none desk:min-h-0">
          <ul className="space-y-1">
            {visible.map((p) => <li key={p.id}>
              <button type="button" aria-pressed={p.id === person?.id} onClick={() => setSelected(p.id)} className="block w-full rounded-lg px-3 py-2 text-start hover:bg-paper-deep aria-pressed:bg-paper-deep">
                <span dir="auto" className="block break-words text-sm font-medium">{name(p)}{p.id === me && <span className="ms-1 text-xs text-ink-soft">({t("pe.you", "you")})</span>}</span>
                <span className="block text-xs text-ink-soft">{p.job_title || (memberships.has(p.id) ? t("pe.federal.single", "Federal member") : t("pe.notitle", "No job title"))}</span>
              </button>
            </li>)}
          </ul>
          {!visible.length && <p className="px-3 py-4 text-sm text-ink-soft">{t("pe.noresults", "No profiles match your search.")}</p>}
        </div>
      </section>
      <section aria-labelledby="pe-profile" className="flex min-w-0 flex-col rounded-xl border border-line bg-card desk:min-h-0">
        <div className="shrink-0 border-b border-line px-4 py-3">
          <h2 id="pe-profile" dir="auto" className="break-words font-display text-xl font-medium">{person ? name(person) : t("pe.profile", "Person profile")}</h2>
          {person && <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
            {person.full_name && person.email && <bdi className="break-all">{person.email}</bdi>}
            {access && <span className="rounded-full border border-line bg-paper px-2 py-0.5 text-xs">{access}</span>}
          </div>}
        </div>
        <div {...scrollRegion("pe-profile")} className="min-w-0 p-4 desk:min-h-0 desk:overflow-auto">
          {person && <div key={person.id} className="grid min-w-0 gap-5 xl:grid-cols-2">
            <PeopleEntities person={person} federal={federal} entities={entities} may={may} me={me} />
            <div className="min-w-0">
              <PeopleRoles person={person} people={people} rows={personRows} useCases={useCases} may={may} me={me} entityAdminOf={entityAdminOf} scopes={scopes}
                caseOwners={rows.filter((row) => row.role === "process_owner" && row.use_case_id && !row.revoked_at)} />
              {may && <AgentSwitch userId={person.id} name={name(person)} />}
            </div>
          </div>}
          <details className="mt-5 border-t border-line pt-3">
            <summary className="cursor-pointer text-sm font-medium underline underline-offset-4">{t("pe.access.reference", "Access reference")}</summary>
            <p className="mt-2 text-sm text-ink-soft">{t("pe.access.limit", "A role is held for the whole organisation, a country, an entity (in its country) or one use case. A country governance admin covers every entity of the country; an entity admin covers one entity. Per-page restrictions require additional access rules.")}</p>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {scopeGuide.map(([id, label, description]) => <div key={id} className="rounded-lg border border-line p-3"><dt className="font-medium">{t(`pe.scope.${id}`, label)}</dt><dd className="text-ink-soft">{t(`pe.scope.${id}.detail`, description)}</dd></div>)}
            </dl>
            <h3 className="mt-4 text-sm font-medium">{t("pe.what", "What each role can do")}</h3>
            {ROLES.map((role) => <details key={role} className="mt-2 rounded-lg border border-line px-3 py-2 text-sm">
              <summary className="cursor-pointer">{role.replaceAll("_", " ")}</summary>
              <ul className="mt-1 list-disc space-y-1 ps-5 text-xs text-ink-soft">{Object.entries(ACTIONS).filter(([, action]) => action.wired && (action.roles as readonly string[]).includes(role)).map(([id, action]) => <li key={id}>{id === "view" ? t("pe.access.read", "Read pages allowed by your access scope") : action.label}</li>)}</ul>
            </details>)}
          </details>
        </div>
      </section>
    </div>
  );
}
