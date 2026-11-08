import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeDashboard, deadlineText } from "@/lib/un/model";
import { loadHitlConfig, loadPolicy, loadUnUseCases } from "@/lib/un/store";
import AdminHeader from "../AdminHeader";
import FederalPanel from "./FederalPanel";

export const metadata: Metadata = {
  title: "Federal dashboard",
  robots: { index: false, follow: false },
};

export default async function FederalPage() {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/admin/federal");
  if (!profile?.org_id) redirect("/login");

  const [{ data: org }, policy, useCases, hitl] = await Promise.all([
    createAdminClient().from("organizations").select("name").eq("id", profile.org_id).maybeSingle(),
    loadPolicy(profile.org_id),
    loadUnUseCases(profile.org_id),
    loadHitlConfig(profile.org_id),
  ]);
  const dashboard = computeDashboard(policy, useCases);

  return (
    <div className="conduit-bg min-h-dvh">
      <AdminHeader active="federal" orgName={org?.name} viewer={profile.role === "viewer"} />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase">
          Federal dashboard
        </p>
        <h1 className="font-display mt-2 text-3xl font-medium tracking-tight sm:text-4xl">
          {policy.name}
        </h1>
        <p className="mt-2 max-w-[68ch] text-sm text-ink-soft">
          {policy.jurisdiction} · {policy.target_percent}% of use cases deployed{deadlineText(policy)}
        </p>
        <FederalPanel
          policy={policy}
          dashboard={dashboard}
          useCases={useCases}
          canEdit={profile.role === "admin"}
          hitl={hitl}
          asOf={new Date().toISOString()}
        />
      </main>
    </div>
  );
}
