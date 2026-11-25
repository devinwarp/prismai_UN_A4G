import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { ACTIONS, ROLES } from "@/lib/un/authz";
import { permissionsFor } from "@/lib/un/permissions-server";
import { loadAssignmentRows, loadPeople, loadUseCaseChoices } from "@/lib/un/roles-store";
import LangShell, { T } from "../_components/Lang";
import { card } from "../_components/ui";
import { PeopleRoles } from "./PeopleRoles";
import { PeopleEntities } from "./PeopleEntities";
import { loadMembers } from "@/lib/un/entity-store";
import { entitiesOf } from "@/lib/un/entity-admin";

export const metadata: Metadata = { title: "People and roles", robots: { index: false, follow: false } };

// who holds which role changes at any time: never prerender it
export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal/people");
  if (!profile?.org_id) redirect("/login");
  const may = (await permissionsFor(profile, user.id)).can("users.manage");
  const [people, rows, useCases, federal] = await Promise.all([loadPeople(profile.org_id), loadAssignmentRows(profile.org_id), loadUseCaseChoices(profile.org_id), loadMembers(profile.org_id).catch(() => [])]);
  // an entity's people are whoever holds a live role on one of its use cases
  const derived = Object.fromEntries(people.map((p) => [p.id, entitiesOf(p.id, rows, useCases)]));
  const what = ROLES.map((r) => ({ role: r, actions: Object.entries(ACTIONS).filter(([, d]) => (d.roles as readonly string[]).includes(r)).map(([id, d]) => ({ id, label: d.label })) }));

  return (
    <LangShell>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase"><T k="pe.eyebrow" en="People and roles" /></p>
        <h1 className="font-display mt-2 text-3xl font-medium tracking-tight sm:text-4xl"><T k="pe.h1" en="Who can do what" /></h1>
        <p className="mt-3 max-w-[68ch] text-base text-ink-soft"><T k="pe.lede" en="A role is held for the whole organisation or for one use case. Nobody changes their own roles. A revoked role stays in the history. An administrator on a person's profile keeps every role until roles are assigned." /></p>
        {!may && <section className={`${card} mt-6`}><p className="text-sm font-medium"><T k="pe.readonly" en="Read only. Assigning roles needs the platform administrator role." /></p></section>}
        <PeopleEntities people={people} federal={federal} derived={derived} useCases={useCases} may={may} />
        <PeopleRoles people={people} rows={rows} useCases={useCases} what={what} may={may} me={user.id} />
      </main>
    </LangShell>
  );
}
