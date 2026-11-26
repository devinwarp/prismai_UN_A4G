import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { allCountries, countryIn, entityCountryOf } from "@/lib/un/country";
import { loadMembers } from "@/lib/un/entity-store";
import { loadFederalCountry } from "@/lib/un/federal-country";
import { isSuperUser, scopePeople } from "@/lib/un/people-directory";
import { loadAssignmentRows, loadPeople, loadUseCaseChoices } from "@/lib/un/roles-store";
import ToolWorkspace from "../_components/ToolWorkspace";
import { T } from "../_components/Lang";
import PeopleDashboard from "./PeopleDashboard";

export const metadata: Metadata = { title: "People and access", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal/people");
  if (!profile?.org_id) redirect("/login");
  const orgId = profile.org_id;
  const [people, rows, useCases, federal, { state }, { data: org }] = await Promise.all([
    loadPeople(orgId), loadAssignmentRows(orgId), loadUseCaseChoices(orgId), loadMembers(orgId),
    loadFederalCountry(orgId, undefined, false), createAdminClient().from("organizations").select("name").eq("id", orgId).maybeSingle(),
  ]);
  const directory = scopePeople({ people, rows, useCases, federal }, user.id, profile.role);
  const choices = directory.useCases.map((useCase) => {
    const id = entityCountryOf(state, useCase.entity);
    return { ...useCase, country: countryIn(state, id)?.name ?? id };
  });
  // what a role can be held for: the countries, and the entities (each in its country). An entity admin may choose only their own entity.
  const entityNames = [...new Set(useCases.map((u) => u.entity))].sort();
  const scopes = {
    countries: allCountries(state).map((c) => ({ id: c.id, name: c.name })),
    entities: entityNames.filter((name) => directory.mayManage || directory.entityAdminOf.includes(name)).map((name) => {
      const id = entityCountryOf(state, name);
      return { name, country_id: id, country: countryIn(state, id)?.name ?? id };
    }),
  };
  return (
    <ToolWorkspace orgName={org?.name} viewer={profile.role === "viewer"}
      scopeLabel={directory.mayManage || directory.federalMember ? <T k="pe.org" en="Whole organisation" /> : directory.entityAdminOf.length ? <T k="pe.scope.entity" en="Entity administrator" /> : <T k="pe.scope.case" en="Use-case team" />}
      title={<T k="pe.dashboard" en="People and access" />}
      description={directory.mayManage ? <T k="pe.dashboard.detail" en="Select a person to review their profile, federal memberships and role assignments." /> : directory.entityAdminOf.length ? <T k="pe.entity.detail" en="The people of your entity. You can give and take back process owner, test author and operator roles for it." /> : <T k="pe.readonly" en="Read only. Assigning roles needs the platform administrator role." />}>
      <PeopleDashboard people={directory.people} rows={directory.rows} useCases={choices} federal={directory.federal} me={user.id} may={directory.mayManage} entityAdminOf={directory.entityAdminOf} scopes={scopes}
        superUserId={directory.people.find((p) => isSuperUser(p.id, p.legacy_role))?.id} />
    </ToolWorkspace>
  );
}
