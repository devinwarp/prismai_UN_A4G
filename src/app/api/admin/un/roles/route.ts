import { NextResponse } from "next/server";
import { bad, caller, forbidden, requirePermission } from "@/lib/api-auth";
import { entityAdminMay, entityOfAction, OWNER_EXISTS, planGrant, type GrantAction } from "@/lib/un/role-admin";
import { insertAssignment, loadAssignmentRows, loadPeople, loadUseCaseChoices, replaceProcessOwner, revokeAssignment } from "@/lib/un/roles-store";
import { loadMembers } from "@/lib/un/entity-store";
import { countryOfEntity, knownCountryIds } from "@/lib/un/scope-context";
import { scopePeople } from "@/lib/un/people-directory";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** GET → the profiles and role assignments visible to the signed-in caller. */
export async function GET() {
  const who = await requirePermission("view");
  if (who instanceof NextResponse) return who;
  const orgId = who.org_id!;
  const [people, rows, useCases, federal] = await Promise.all([loadPeople(orgId), loadAssignmentRows(orgId), loadUseCaseChoices(orgId), loadMembers(orgId)]);
  const scoped = scopePeople({ people, rows, useCases, federal }, who.id, who.role);
  return NextResponse.json({ people: scoped.people, assignments: scoped.rows, use_cases: scoped.useCases });
}

/** POST { action: "grant", user_id, role, use_case_id?, entity?, country? }, { action: "revoke", assignment_id } or { action: "replace_process_owner", assignment_id, user_id }
 * → needs users.manage, or (for the people of one entity: process owner, test author, operator and viewer roles) entity.people for that entity.
 * A use case may have one active process owner. Replacement transfers ownership atomically.
 * A role is held for the whole organisation (no use_case_id) or for one use case. Nobody changes their own roles. A
 * revoked assignment stays in the history. */
export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (b.action !== "grant" && b.action !== "revoke" && b.action !== "replace_process_owner") return bad("Unknown action");
  const action: GrantAction = b.action === "grant"
    ? { type: "grant", user_id: text(b.user_id, 80), role: text(b.role, 40), use_case_id: text(b.use_case_id, 80) || null, entity: text(b.entity, 120) || null, country: text(b.country, 12) || null }
    : b.action === "replace_process_owner"
      ? { type: "replace_process_owner", assignment_id: text(b.assignment_id, 80), user_id: text(b.user_id, 80) }
      : { type: "revoke", assignment_id: text(b.assignment_id, 80) };
  // an administrator with users.manage may do anything; otherwise the entity admin of the entity the change concerns may, within the entity-admin rules
  const me = await caller();
  if (!me?.org_id) return forbidden("Forbidden");
  const [people, rows, ucs] = await Promise.all([loadPeople(me.org_id), loadAssignmentRows(me.org_id), loadUseCaseChoices(me.org_id)]);
  let who = await requirePermission("users.manage");
  if (who instanceof NextResponse) {
    const entity = entityOfAction(action, { rows, useCases: ucs });
    if (!entity) return who;
    const viaEntity = await requirePermission("entity.people", { entity });
    if (viaEntity instanceof NextResponse) return viaEntity;
    const refused = entityAdminMay(action, entity, { rows, useCases: ucs });
    if (refused) return forbidden(refused);
    who = viaEntity;
  }
  // an entity scope records the entity's country too, so the role is held for that entity in that country only
  if (action.type === "grant" && action.entity && !action.country) action.country = await countryOfEntity(me.org_id, action.entity);
  const p = planGrant(action, { rows, knownUsers: people.map((x) => x.id), knownUseCases: ucs.map((x) => x.id), knownEntities: [...new Set(ucs.map((x) => x.entity))], knownCountries: await knownCountryIds(me.org_id), by: who.id });
  if (!p.ok) return p.error === OWNER_EXISTS ? NextResponse.json({ error: p.error }, { status: 409 }) : bad(p.error);
  if (p.type === "replace") {
    const error = await replaceProcessOwner(who.org_id!, p.revoke.assignment_id, p.grant.user_id, who.id);
    if (error) return NextResponse.json({ error }, { status: 500 });
    return NextResponse.json({ ok: true, type: "replace" });
  }
  const err = p.type === "grant" ? await insertAssignment(who.org_id!, p.row) : await revokeAssignment(who.org_id!, p.assignment_id, p.revoked_by);
  if (err) return NextResponse.json({ error: err }, { status: err === OWNER_EXISTS ? 409 : 500 });
  return NextResponse.json({ ok: true, type: p.type });
}
