import type { Metadata } from "next";
import type { CountryQuery } from "@/lib/un/country-context";
import { loadCountrySop } from "@/lib/un/federal-country";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { requireFederalToolAccess } from "@/lib/un/federal-read-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { appKbStore } from "@/lib/un/kb-store-app";
import { extractSkill } from "@/lib/un/sop-kb";
import { loadState, PROFILES } from "@/lib/un/tuning-service";
import ToolWorkspace, { WorkspacePane } from "../_components/ToolWorkspace";
import { T } from "../_components/Lang";
import TuningBoard from "./TuningBoard";

export const metadata: Metadata = { title: "Tune the agent", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function TuningPage({ searchParams }: { searchParams: Promise<CountryQuery> }) {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal/tuning");
  if (!profile?.org_id) redirect("/login");
  const { browseCountries } = await requireFederalToolAccess(profile.org_id, user.id, profile.role);
  const { country, uc02 } = await loadCountrySop(profile.org_id, (await searchParams).country, browseCountries);
  const { data: org } = await createAdminClient().from("organizations").select("name").eq("id", profile.org_id).maybeSingle();
  const state = uc02 ? await loadState({ store: appKbStore(profile.org_id) }) : null;
  const profiles = state ? PROFILES.map((name) => ({ name, base: extractSkill("SOP-LIC-014", name).markdown, active: state.skills[name] })) : [];
  const canEdit = profile.role === "admin";
  return (
    <ToolWorkspace country={country} orgName={org?.name} viewer={profile.role === "viewer"}
      title={<T k="workspace.tuning" en="Agent tuning" />}
      description={state && <T k="tn.eyebrow" en="SOP-LIC-014 (synthetic)" />}>
      {state ? <TuningBoard key={country.id} state={state} profiles={profiles} canEdit={canEdit} /> : (
        <WorkspacePane id="tuning-unavailable" title={<T k="workspace.tuning" en="Agent tuning" />}>
          <p className="text-sm text-ink-soft"><T k="tn.country.empty" en="No demo agent is available to tune in this country." /></p>
        </WorkspacePane>
      )}
    </ToolWorkspace>
  );
}
