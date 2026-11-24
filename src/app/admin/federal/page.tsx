import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeDashboard } from "@/lib/un/model";
import { effectiveGates } from "@/lib/un/gates";
import { factsOf, loadGov } from "@/lib/un/gates-store";
import { loadJourneys } from "@/lib/un/journey-store";
import { loadHitlConfig, loadPolicy, loadUnUseCases } from "@/lib/un/store";
import AdminHeader from "../AdminHeader";
import LangShell, { T, TV } from "./_components/Lang";
import { DeadlineNote } from "./_components/Deadline";
import CitizenMessageCheck from "./_components/CitizenMessageCheck";
import FederalPanel from "./FederalPanel";

export const metadata: Metadata = {
  title: "Federal dashboard",
  robots: { index: false, follow: false },
};

export default async function FederalPage() {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal");
  if (!profile?.org_id) redirect("/login");

  const [{ data: org }, policy, useCases, hitl, gov] = await Promise.all([
    createAdminClient().from("organizations").select("name").eq("id", profile.org_id).maybeSingle(),
    loadPolicy(profile.org_id),
    loadUnUseCases(profile.org_id),
    loadHitlConfig(profile.org_id),
    loadGov(profile.org_id),
  ]);
  const gatesAdded = Object.fromEntries(useCases.map((u) => [u.ext_id, effectiveGates({ ext: u.ext_id, facts: factsOf(u), gov }).added.length]));
  const dashboard = computeDashboard(policy, useCases);
  const journeys = Object.fromEntries(await loadJourneys(profile.org_id, useCases));

  return (
    <div className="conduit-bg min-h-dvh">
      <AdminHeader active="federal" orgName={org?.name} viewer={profile.role === "viewer"} country />
      <LangShell>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase">
          <T k="page.federal" en="Federal dashboard" />
        </p>
        <h1 className="font-display mt-2 text-3xl font-medium tracking-tight sm:text-4xl">
          {policy.name}
        </h1>
        <p className="mt-2 max-w-[68ch] text-sm text-ink-soft">
          {policy.jurisdiction} · <TV k="ua.pg.sub" en="{p}% of use cases deployed" v={{ p: policy.target_percent }} /><DeadlineNote policy={policy} />
        </p>
        <FederalPanel
          policy={policy}
          dashboard={dashboard}
          useCases={useCases}
          canEdit={profile.role === "admin"}
          hitl={hitl}
          gatesAdded={gatesAdded}
          journeys={journeys}
          asOf={new Date().toISOString()}
        />
        <CitizenMessageCheck />
      </main>
      </LangShell>
    </div>
  );
}
