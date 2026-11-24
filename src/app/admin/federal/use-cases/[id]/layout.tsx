import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadJourneys } from "@/lib/un/journey-store";
import { isUuid } from "@/lib/un/model";
import { loadUseCase } from "@/lib/un/sijil-store";
import AdminHeader from "../../../AdminHeader";
import JourneyBar from "../../_components/JourneyBar";
import { AutoTuneBanner } from "./AutoTuneBanner";

/** Header and the journey bar for every use-case page. The bar is derived from the stored records on each request. */
export default async function UseCaseLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect(`/login?next=/admin/federal/use-cases/${id}`);
  if (!profile?.org_id) redirect("/login");
  if (!isUuid(id)) notFound();
  const uc = await loadUseCase(profile.org_id, id);
  if (!uc) notFound();
  const [{ data: org }, journeys] = await Promise.all([
    createAdminClient().from("organizations").select("name").eq("id", profile.org_id).maybeSingle(),
    loadJourneys(profile.org_id, [uc]),
  ]);
  return (
    <div className="conduit-bg min-h-dvh">
      <AdminHeader active="federal" orgName={org?.name} viewer={profile.role === "viewer"} />
      <Suspense fallback={null}>
        <JourneyBar base={`/admin/federal/use-cases/${id}`} journey={journeys.get(id)!} />
      </Suspense>
      <AutoTuneBanner orgId={profile.org_id} id={id} />
      {children}
    </div>
  );
}
