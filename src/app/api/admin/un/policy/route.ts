import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bad, requireAdmin } from "@/lib/api-auth";
import { VERDICTS, type Verdict } from "@/lib/un/model";

/** PUT { name, jurisdiction, source_url?, target_percent, deadline?, counting_verdicts[] } */
export async function PUT(request: Request) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const jurisdiction = typeof b.jurisdiction === "string" ? b.jurisdiction.trim() : "";
  const target = Number(b.target_percent);
  const verdicts = Array.isArray(b.counting_verdicts) ? b.counting_verdicts : [];
  if (!name || !jurisdiction) return bad("Name and jurisdiction are required");
  if (!Number.isFinite(target) || target < 0 || target > 100) {
    return bad("Target must be between 0 and 100");
  }
  if (!verdicts.length || !verdicts.every((v) => VERDICTS.includes(v as Verdict))) {
    return bad("Pick at least one valid counting verdict");
  }
  const deadline = typeof b.deadline === "string" && b.deadline ? b.deadline : null;
  if (deadline && Number.isNaN(Date.parse(deadline))) return bad("Deadline is not a date");
  const { error } = await createAdminClient()
    .from("un_policy")
    .upsert({
      org_id: who.org_id,
      name,
      jurisdiction,
      source_url: typeof b.source_url === "string" && b.source_url.trim() ? b.source_url.trim() : null,
      target_percent: target,
      deadline,
      counting_verdicts: verdicts,
      updated_at: new Date().toISOString(),
    });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
