import { notFound, redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { mayReadUseCase } from "@/lib/un/federal-read-access";
import { loadState } from "@/lib/un/country-actions";
import { appCountryDeps } from "@/lib/un/country-app";
import { entityCountryOf } from "@/lib/un/country";
import { isUuid } from "@/lib/un/model";
import { loadUseCase } from "@/lib/un/sijil-store";

// A use case's process targets are drafted by the targets agent and edited and approved on the setup page (step 4). This route stays so that
// saved links and earlier notifications keep working: it opens that step on this use case.
export const dynamic = "force-dynamic";

export default async function TargetsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect(`/login?next=/admin/federal/use-cases/${id}/targets`);
  if (!profile?.org_id) redirect("/login");
  if (!isUuid(id)) notFound();
  if (!(await mayReadUseCase(profile.org_id, user.id, profile.role, id))) notFound();
  const uc = await loadUseCase(profile.org_id, id);
  if (!uc) notFound();
  const { state } = await loadState(appCountryDeps(profile.org_id));
  const next = new URLSearchParams({ step: "targets", entity: uc.entity, uc: uc.ext_id });
  const country = entityCountryOf(state, uc.entity);
  if (country) next.set("country", country);
  redirect(`/admin/federal/setup?${next}#step-targets`);
}
