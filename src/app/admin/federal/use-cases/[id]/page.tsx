import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadEntityGoals } from "@/lib/un/store";
import { attest, TARGET_RUNS, DEFAULT_THRESHOLDS } from "@/lib/un/sijil";
import { loadReports, loadRuns, loadUseCase } from "@/lib/un/sijil-store";
import AdminHeader from "../../../AdminHeader";
import { liveConfigFromEnv, liveNode } from "@/lib/un/sijil-live";
import SijilPanel from "./SijilPanel";

export const metadata: Metadata = { title: "Pilot and Sijil", robots: { index: false, follow: false } };

export default async function UseCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect(`/login?next=/admin/federal/use-cases/${id}`);
  if (!profile?.org_id) redirect("/login");
  const uc = await loadUseCase(profile.org_id, id);
  if (!uc) notFound();
  const [goals, runs, reports, { data: org }] = await Promise.all([
    loadEntityGoals(profile.org_id, uc.entity),
    loadRuns(profile.org_id, id),
    loadReports(profile.org_id, id),
    createAdminClient().from("organizations").select("name").eq("id", profile.org_id).maybeSingle(),
  ]);
  let liveMode = false;
  try { liveMode = liveConfigFromEnv() !== null; } catch { liveMode = true; /* misconfigured: the pull reports the error */ }
  return (
    <div className="conduit-bg min-h-dvh">
      <AdminHeader active="federal" orgName={org?.name} viewer={profile.role === "viewer"} />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <SijilPanel
          uc={uc}
          runs={runs}
          goals={goals}
          attestation={attest(runs)}
          thresholds={DEFAULT_THRESHOLDS}
          target={TARGET_RUNS}
          liveMode={liveMode}
          liveNode={liveNode(runs)}
          reports={reports}
          canEdit={profile.role === "admin"}
        />
      </main>
    </div>
  );
}
