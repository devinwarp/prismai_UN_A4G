import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bad, requireAdmin } from "@/lib/api-auth";
import { HITL_RULE_IDS, isHitlRule } from "@/lib/un/hitl";

/** PUT { entity, off: HitlRuleId[] } : the rules this entity switches off. */
export async function PUT(request: Request) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const entity = typeof b.entity === "string" ? b.entity.trim() : "";
  const off = Array.isArray(b.off) ? b.off : [];
  if (!entity) return bad("Entity is required");
  if (!off.every(isHitlRule)) return bad("Unknown rule");
  const { error } = await createAdminClient()
    .from("un_hitl_rules")
    .upsert(
      HITL_RULE_IDS.map((rule) => ({ org_id: who.org_id, entity, rule, enabled: !off.includes(rule), updated_at: new Date().toISOString() })),
      { onConflict: "org_id,entity,rule" },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
