import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadJourneys } from "@/lib/un/journey-store";
import { isUuid } from "@/lib/un/model";
import { loadUseCase } from "@/lib/un/sijil-store";
import AdminHeader from "../../../AdminHeader";
import { nextStep } from "@/lib/un/next-step";
import { loadReleaseCached } from "@/lib/un/release-cached";
import { AutoTuneBanner } from "./AutoTuneBanner";
import NextStepCard from "./NextStepCard";
import StageStrip from "./StageStrip";
import UseCaseHeader from "./UseCaseHeader";
import UseCaseTabs from "./UseCaseTabs";

/** Header and the journey bar for every use-case page. The bar is derived from the stored records on each request. */
export default async function UseCaseLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect(`/login?next=/admin/federal/use-cases/${id}`);
  if (!profile?.org_id) redirect("/login");
  if (!isUuid(id)) notFound();
  const uc = await loadUseCase(profile.org_id, id);
  if (!uc) notFound();
  const [{ data: org }, journeys, release] = await Promise.all([
    createAdminClient().from("organizations").select("name").eq("id", profile.org_id).maybeSingle(),
    loadJourneys(profile.org_id, [uc]),
    loadReleaseCached(profile.org_id, id),
  ]);
  const journey = journeys.get(id)!;
  const base = `/admin/federal/use-cases/${id}`;
  const signed = uc.verdict ? { verdict: uc.verdict, by: uc.verdict_signed_by ?? null, at: uc.verdict_signed_at ?? null } : null;
  const step = nextStep({ readiness: release, journey, signed });
  return (
    <div className="conduit-bg min-h-dvh">
      <AdminHeader active="federal" orgName={org?.name} viewer={profile.role === "viewer"} />
      <UseCaseHeader uc={{ ext_id: uc.ext_id, entity: uc.entity, title: uc.title, quadrant: uc.quadrant, client_facing: uc.client_facing, verdict: uc.verdict, stage: uc.stage }} />
      <Suspense fallback={null}>
        <div className="mt-3"><StageStrip base={base} journey={journey} /></div>
      </Suspense>
      <AutoTuneBanner orgId={profile.org_id} id={id} />
      <NextStepCard id={id} step={step} readOnly={profile.role === "viewer"} />
      <Suspense fallback={null}>
        <UseCaseTabs base={base} />
      </Suspense>
      {children}
    </div>
  );
}
