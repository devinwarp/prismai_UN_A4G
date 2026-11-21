import { NextResponse } from "next/server";
import { bad, notFound, requireAdmin } from "@/lib/api-auth";
import { isUuid } from "@/lib/un/model";
import { attachSop, loadAttachedSop, saveTick } from "@/lib/un/profiles-store";
import { loadUseCase } from "@/lib/un/sijil-store";
import { checkSopKb, writeSkill } from "@/lib/un/skill-extract";
import { profilesOf } from "@/lib/un/sop/data";

type Ctx = { params: Promise<{ id: string }> };

/** POST { action: "attach", sop_id }  attach a sample SOP to the use case.
 *      { action: "tick", profile, automate }  tick or untick Automate on one job profile.
 * Ticking checks the SOP knowledge base is vectorised and current, and extracts the profile's skill file.
 * A SOP without a current knowledge base can still be ticked (so it is assessed), but the journey shows what is missing. */
export async function POST(request: Request, { params }: Ctx) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const b = (await request.json().catch(() => ({}))) as { action?: unknown; sop_id?: unknown; profile?: unknown; automate?: unknown };
  const uc = await loadUseCase(who.org_id!, id);
  if (!uc) return notFound();

  if (b.action === "attach") {
    if (typeof b.sop_id !== "string" || !profilesOf(b.sop_id)) return bad("Unknown SOP");
    const err = await attachSop(who.org_id!, id, b.sop_id, who.id);
    return err ? NextResponse.json({ error: err }, { status: 500 }) : NextResponse.json({ ok: true, sop_id: b.sop_id });
  }

  if (b.action === "tick") {
    const sopId = await loadAttachedSop(who.org_id!, id);
    if (!sopId) return bad("Attach an SOP first");
    if (typeof b.profile !== "string" || typeof b.automate !== "boolean") return bad("profile and automate are required");
    if (!profilesOf(sopId)?.some((p) => p.name === b.profile)) return bad("Unknown job profile");
    const kb = b.automate ? checkSopKb(sopId) : null;
    const skill = b.automate && kb?.ok ? writeSkill(sopId, b.profile) : null;
    const err = await saveTick(who.org_id!, id, sopId, b.profile, b.automate, who.id, skill?.ok ? { path: skill.path, sha256: skill.sha256 } : null);
    if (err) return NextResponse.json({ error: err }, { status: 500 });
    return NextResponse.json({ ok: true, kb, skill });
  }
  return bad('action must be "attach" or "tick"');
}
