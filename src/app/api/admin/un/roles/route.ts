import { NextResponse } from "next/server";
import { bad, forbidden, requirePermission } from "@/lib/api-auth";
import { OWNER_EXISTS, planGrant, type GrantAction } from "@/lib/un/role-admin";
import { insertAssignment, loadAssignmentRows, loadPeople, loadUseCaseChoices, replaceProcessOwner, revokeAssignment } from "@/lib/un/roles-store";
import { loadMembers } from "@/lib/un/entity-store";
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

/** POST { action: "grant", user_id, role, use_case_id? }, { action: "revoke", assignment_id } or { action: "replace_process_owner", assignment_id, user_id } → needs users.manage.
 * A use case may have one active process owner. Replacement transfers ownership atomically.
 * A role is held for the whole organisation (no use_case_id) or for one use case. Nobody changes their own roles. A
 * revoked assignment stays in the history. */
export async function POST(request: Request) {
  const who = await requirePermission("users.manage");
  if (who instanceof NextResponse) return who;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const may = who.decide("users.manage");
  if (!may.ok) return forbidden(may.reason);
  if (b.action !== "grant" && b.action !== "revoke" && b.action !== "replace_process_owner") return bad("Unknown action");
  const action: GrantAction = b.action === "grant"
    ? { type: "grant", user_id: text(b.user_id, 80), role: text(b.role, 40), use_case_id: text(b.use_case_id, 80) || null }
    : b.action === "replace_process_owner"
      ? { type: "replace_process_owner", assignment_id: text(b.assignment_id, 80), user_id: text(b.user_id, 80) }
      : { type: "revoke", assignment_id: text(b.assignment_id, 80) };
  const [people, rows, ucs] = await Promise.all([loadPeople(who.org_id!), loadAssignmentRows(who.org_id!), loadUseCaseChoices(who.org_id!)]);
  const p = planGrant(action, { rows, knownUsers: people.map((x) => x.id), knownUseCases: ucs.map((x) => x.id), by: who.id });
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
