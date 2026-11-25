import { NextResponse } from "next/server";
import { bad, requireAdmin } from "@/lib/api-auth";
import { recordChange } from "@/lib/un/country-actions";
import { appCountryDeps } from "@/lib/un/country-app";
import { planEntity, type EntityAction } from "@/lib/un/entity-admin";
import { loadKnownEntities, saveEntity } from "@/lib/un/entity-store";

/** POST { action: "add", name, sector?, goals? } | { action: "set_goals", name, goals } | { action: "set_hidden", name, hidden }. Admin only.
 * Hiding is reversible: a hidden entity's use cases leave the dashboard counts and the lists, nothing is deleted. Every change is also written
 * to the hash-chained country log, which records who changed what and when. */
export async function POST(request: Request) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b !== "object") return bad("Invalid JSON");
  if (b.action !== "add" && b.action !== "set_goals" && b.action !== "set_hidden") return bad("Unknown action");
  const orgId = who.org_id!;
  const { rows, known } = await loadKnownEntities(orgId);
  const action = (b.action === "add" ? { type: "add", name: b.name, sector: b.sector, goals: b.goals } : b.action === "set_goals" ? { type: "set_goals", name: b.name, goals: b.goals } : { type: "set_hidden", name: b.name, hidden: b.hidden }) as EntityAction;
  const plan = planEntity(action, { known, hidden: rows.filter((r) => r.hidden).map((r) => r.name) });
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status });
  const actor = who.email ?? who.id;
  let err: string | null = null;
  let kind: "entity_added" | "entity_goals" | "entity_hidden" = "entity_added";
  let payload: Record<string, unknown> = {};
  if (plan.type === "add") { err = await saveEntity(orgId, plan.row.name, { sector: plan.row.sector, goals: plan.row.goals, hidden: false }, who.id); payload = { name: plan.row.name, sector: plan.row.sector, goals: plan.row.goals }; }
  else if (plan.type === "set_goals") {
    kind = "entity_goals";
    const before = rows.find((r) => r.name === plan.name)?.goals ?? [];
    err = await saveEntity(orgId, plan.name, { goals: plan.goals }, who.id);
    payload = { name: plan.name, before, after: plan.goals };
  } else {
    kind = "entity_hidden";
    if (plan.noop) return NextResponse.json({ ok: true, noop: true });
    err = await saveEntity(orgId, plan.name, { hidden: plan.hidden }, who.id);
    payload = { name: plan.name, hidden: plan.hidden };
  }
  if (err) return NextResponse.json({ error: err }, { status: 500 });
  const audited = await recordChange(appCountryDeps(orgId), actor, kind, payload);
  return NextResponse.json({ ok: true, audited });
}
