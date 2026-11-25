import { NextResponse } from "next/server";
import { bad, forbidden, requirePermission } from "@/lib/api-auth";
import { recordChange } from "@/lib/un/country-actions";
import { appCountryDeps } from "@/lib/un/country-app";
import { parseJobTitle, planMember } from "@/lib/un/entity-admin";
import { endMember, insertMember, loadMembers, setJobTitle } from "@/lib/un/entity-store";
import { loadPeople } from "@/lib/un/roles-store";

/** POST { action: "add_federal", body, user_id } | { action: "remove_federal", member_id } | { action: "set_job_title", user_id, job_title } → needs users.manage.
 * A federal member is a person who holds platform-wide roles for a federal body (the central authority, the president's office); the membership ends rather
 * than being deleted. An entity's people are not stored here: they are whoever holds a role on one of its use cases (the roles route grants them). A job title
 * is the text the approver rules match against a job profile's name. Each change is also written to the hash-chained country log. */
export async function POST(request: Request) {
  const who = await requirePermission("users.manage");
  if (who instanceof NextResponse) return who;
  const may = who.decide("users.manage");
  if (!may.ok) return forbidden(may.reason);
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b !== "object") return bad("Invalid JSON");
  const orgId = who.org_id!;
  const actor = who.email ?? who.id;
  const d = appCountryDeps(orgId);
  const people = await loadPeople(orgId);

  if (b.action === "set_job_title") {
    const uid = typeof b.user_id === "string" ? b.user_id : "";
    const person = people.find((p) => p.id === uid);
    if (!person) return bad("That person is not in this organisation");
    const t = parseJobTitle(b.job_title);
    if (!t.ok) return bad(t.error);
    if (t.title === person.job_title) return NextResponse.json({ ok: true, noop: true });
    const err = await setJobTitle(orgId, uid, t.title);
    if (err) return NextResponse.json({ error: err }, { status: 500 });
    const audited = await recordChange(d, actor, "person_title", { user_id: uid, email: person.email, before: person.job_title, after: t.title });
    return NextResponse.json({ ok: true, audited });
  }
  if (b.action !== "add_federal" && b.action !== "remove_federal") return bad("Unknown action");
  const rows = await loadMembers(orgId);
  const plan = planMember(b.action === "add_federal" ? { type: "add", body: b.body, user_id: b.user_id } : { type: "remove", member_id: b.member_id }, { rows, knownUsers: people.map((p) => p.id), by: who.id });
  if (!plan.ok) return bad(plan.error);
  const err = plan.type === "add" ? await insertMember(orgId, plan.row) : await endMember(orgId, plan.member_id, plan.removed_by);
  if (err) return NextResponse.json({ error: err }, { status: 500 });
  const audited = await recordChange(d, actor, "federal_member", plan.type === "add" ? { type: "add", body: plan.row.body, user_id: plan.row.user_id } : { type: "remove", member_id: plan.member_id, body: rows.find((r) => r.id === plan.member_id)?.body, user_id: rows.find((r) => r.id === plan.member_id)?.user_id });
  return NextResponse.json({ ok: true, audited });
}
