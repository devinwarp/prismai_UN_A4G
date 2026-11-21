import { NextResponse } from "next/server";
import { bad, requireAdmin } from "@/lib/api-auth";
import { adminMemoryStore } from "@/lib/un/case-memory-store";
import { answerOutside } from "@/lib/un/outside-queue";
import { isUuid } from "@/lib/un/model";
import { createAdminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

/** POST {answer} → a person answers an open outside-information request. Admin only (viewers are read-only).
 * The answer is appended to the case's hash-chained memory with the answerer's role. */
export async function POST(req: Request, { params }: Ctx) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  const { id } = await params;
  if (!isUuid(id)) return bad("Bad request id");
  const body = (await req.json().catch(() => ({}))) as { answer?: unknown };
  if (typeof body.answer !== "string") return bad("answer is required");
  const r = await answerOutside(createAdminClient(), who.org_id!, id, { role: who.role, userId: who.id }, body.answer, adminMemoryStore(who.org_id!));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error.startsWith("Read-only") ? 403 : 400 });
  return NextResponse.json({ ok: true, memory_hash: r.hash });
}
