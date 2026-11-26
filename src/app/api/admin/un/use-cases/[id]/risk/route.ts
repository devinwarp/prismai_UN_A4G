import { NextResponse } from "next/server";
import { bad, notFound, requirePermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordChange } from "@/lib/un/country-actions";
import { appCountryDeps } from "@/lib/un/country-app";
import { parseRiskPatch } from "@/lib/un/hitl";
import { isUuid } from "@/lib/un/model";
import { loadUseCase } from "@/lib/un/sijil-store";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const who = await requirePermission("risk.edit", { useCaseId: id });
  if (who instanceof NextResponse) return who;
  const patch = parseRiskPatch(await request.json().catch(() => null));
  if (!patch) return bad("Supply at least one risk flag as true or false.");
  const orgId = who.org_id!;
  const useCase = await loadUseCase(orgId, id);
  if (!useCase) return notFound();
  const { data, error } = await createAdminClient().from("un_use_cases").update({ ...patch, updated_at: new Date().toISOString() })
    .eq("org_id", orgId).eq("id", id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return notFound();
  const audited = await recordChange(appCountryDeps(orgId), who.email ?? who.id, "use_case_risk", {
    use_case: useCase.ext_id, before: Object.fromEntries(Object.keys(patch).map((field) => [field, !!useCase[field as keyof typeof patch]])), after: patch,
  });
  return NextResponse.json({ ok: true, audited });
}
