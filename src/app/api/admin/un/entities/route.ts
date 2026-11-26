import { NextResponse } from "next/server";
import { bad, requireAdmin, requirePermission } from "@/lib/api-auth";
import { entityRegistrationReady, loadState, recordChange } from "@/lib/un/country-actions";
import { countryIn } from "@/lib/un/country";
import { appCountryDeps } from "@/lib/un/country-app";
import { planEntity, type EntityAction } from "@/lib/un/entity-admin";
import { loadKnownEntities, registerEntity, saveEntity } from "@/lib/un/entity-store";

/** POST { action: "add", name, country, sector?, goals } | { action: "set_goals", name, goals } | { action: "set_hidden", name, hidden }. Admin only.
 * Hiding is reversible: a hidden entity's use cases leave the dashboard counts and the lists, nothing is deleted. Every change is also written
 * to the hash-chained country log, which records who changed what and when. */
export async function POST(request: Request) {
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b !== "object") return bad("Invalid JSON");
  // the goals and criteria of an entity are set by its entity admin (for that entity only); adding or hiding an entity is an administrator's
  const who = b.action === "set_goals" && typeof b.name === "string" ? await requirePermission("entity.setup", { entity: b.name }) : await requireAdmin();
  if (who instanceof NextResponse) return who;
  if (b.action !== "add" && b.action !== "set_goals" && b.action !== "set_hidden") return bad("Unknown action");
  const orgId = who.org_id!;
  const { rows, known } = await loadKnownEntities(orgId);
  const action = (b.action === "add" ? { type: "add", name: b.name, sector: b.sector, goals: b.goals } : b.action === "set_goals" ? { type: "set_goals", name: b.name, goals: b.goals } : { type: "set_hidden", name: b.name, hidden: b.hidden }) as EntityAction;
  const plan = planEntity(action, { known, hidden: rows.filter((r) => r.hidden).map((r) => r.name),
    measured: rows.filter((r) => r.country_id).map((r) => r.name) });
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status });
  const actor = who.email ?? who.id;
  const deps = appCountryDeps(orgId);
  let err: string | null = null;
  let kind: "entity_added" | "entity_goals" | "entity_hidden" = "entity_added";
  let payload: Record<string, unknown> = {};
  if (plan.type === "add") {
    const { state } = await loadState(deps);
    const country = typeof b.country === "string" ? countryIn(state, b.country) : undefined;
    if (!country) return bad("Select a valid country.");
    if (!(await entityRegistrationReady(deps, state, country))) {
      return NextResponse.json({ error: "Set up the country's rules and build its policy knowledge base before adding an entity." }, { status: 409 });
    }
    const error = await registerEntity(orgId, plan.row, country.id, who.id);
    if (error?.code === "23505") return NextResponse.json({ error: "An entity with this name already exists." }, { status: 409 });
    err = error?.message ?? null;
    payload = { name: plan.row.name, country: country.id, sector: plan.row.sector, goals: plan.row.goals };
  }
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
  const audited = await recordChange(deps, actor, kind, payload);
  return NextResponse.json({ ok: true, audited, ...(plan.type === "set_goals" ? { goals: plan.goals } : {}) });
}
