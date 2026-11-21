import { NextResponse } from "next/server";
import { bad, forbidden, requirePermission } from "@/lib/api-auth";
import { planGrant, type GrantAction } from "@/lib/un/role-admin";
import { insertAssignment, loadAssignmentRows, loadPeople, loadUseCaseChoices, revokeAssignment } from "@/lib/un/roles-store";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** GET → everyone in the organisation with their role assignments (live and revoked). Read-only: any signed-in role. */
export async function GET() {
  const who = await requirePermission("view");
  if (who instanceof NextResponse) return who;
  const [people, rows, use_cases] = await Promise.all([loadPeople(who.org_id!), loadAssignmentRows(who.org_id!), loadUseCaseChoices(who.org_id!)]);
  return NextResponse.json({ people, assignments: rows, use_cases });
}

/** POST { action: "grant", user_id, role, use_case_id? } or { action: "revoke", assignment_id } → needs users.manage.
 * A role is held for the whole organisation (no use_case_id) or for one use case. Nobody changes their own roles. A
 * revoked assignment stays in the history. */
export async function POST(request: Request) {
  const who = await requirePermission("users.manage");
  if (who instanceof NextResponse) return who;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const may = who.decide("users.manage");
  if (!may.ok) return forbidden(may.reason);
  if (b.action !== "grant" && b.action !== "revoke") return bad("Unknown action");
  const action: GrantAction = b.action === "grant"
    ? { type: "grant", user_id: text(b.user_id, 80), role: text(b.role, 40), use_case_id: text(b.use_case_id, 80) || null }
    : { type: "revoke", assignment_id: text(b.assignment_id, 80) };
  const [people, rows, ucs] = await Promise.all([loadPeople(who.org_id!), loadAssignmentRows(who.org_id!), loadUseCaseChoices(who.org_id!)]);
  const p = planGrant(action, { rows, knownUsers: people.map((x) => x.id), knownUseCases: ucs.map((x) => x.id), by: who.id });
  if (!p.ok) return bad(p.error);
  const err = p.type === "grant" ? await insertAssignment(who.org_id!, p.row) : await revokeAssignment(who.org_id!, p.assignment_id, p.revoked_by);
  if (err) return NextResponse.json({ error: err }, { status: 500 });
  return NextResponse.json({ ok: true, type: p.type });
}
