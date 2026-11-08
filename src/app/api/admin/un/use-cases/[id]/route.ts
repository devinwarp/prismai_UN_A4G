import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bad, notFound, requireAdmin } from "@/lib/api-auth";
import { parseUseCasePatch } from "@/lib/un/guard";
import { isUuid } from "@/lib/un/model";

/** PATCH { stage? }. verdict and compliant are rejected (400): the verdict is
 * written only from a signed scenario run and compliance only from a passing
 * Sijil attestation (I-1; see lib/un/guard.ts). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseUseCasePatch(b);
  if (!parsed.ok) return bad(parsed.error);
  const patch = { ...parsed.patch, updated_at: new Date().toISOString() };
  const { data, error } = await createAdminClient()
    .from("un_use_cases")
    .update(patch)
    .eq("id", id)
    .eq("org_id", who.org_id!)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Use case not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
