import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { bad, forbidden, requirePermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOffline } from "@/lib/supabase/offline-flag";
import { sweepPeople } from "@/lib/un/inbox-service";
import { appendAgentLog } from "@/lib/un/inbox-store";
import { entityAdminMay, planGrant, type GrantAction } from "@/lib/un/role-admin";
import { insertAssignment, loadAssignmentRows, loadPeople, loadUseCaseChoices } from "@/lib/un/roles-store";
import { knownCountryIds, countryOfEntity } from "@/lib/un/scope-context";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST { email, name, job_title, entity, use_case_id?, role?, item_id? } → creates a user for an entity. Needs user.create for that entity (its entity admin, or
 * an administrator). A person makes the account; an agent only stages one (the item the form is prefilled from). The new person may be given a role at once:
 * an entity admin may give process owner, test author or operator for their own entity only. Online, the account is made in the sign-in service with
 * a random password that is returned ONCE here and kept nowhere; offline there is no password (use the sign-in-as picker).
 */
export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const entity = text(b.entity, 120);
  if (!entity) return bad("Choose the entity the user is for");
  const who = await requirePermission("user.create", { entity });
  if (who instanceof NextResponse) return who;
  const orgId = who.org_id!;
  const email = text(b.email, 200).toLowerCase();
  const name = text(b.name, 120);
  const job_title = text(b.job_title, 120);
  if (!EMAIL.test(email)) return bad("Enter a valid email address");
  if (!name || !job_title) return bad("A name and a job position are needed: the position is how the person is linked to the SOP's job profiles");
  const people = await loadPeople(orgId);
  if (people.some((p) => (p.email ?? "").toLowerCase() === email)) return NextResponse.json({ error: "Someone with that email already exists" }, { status: 409 });

  // decide the role first, so nothing is created if it would be refused
  const role = text(b.role, 40);
  const use_case_id = text(b.use_case_id, 80) || null;
  const ucs = await loadUseCaseChoices(orgId);
  let grant: GrantAction | null = null;
  if (role) {
    grant = { type: "grant", user_id: "(new)", role, use_case_id, ...(use_case_id ? {} : { entity, country: await countryOfEntity(orgId, entity) }) };
    if (!who.decide("users.manage").ok) {
      const refused = entityAdminMay(grant, entity, { rows: [], useCases: ucs });
      if (refused) return forbidden(refused);
    }
    const dry = planGrant({ ...grant, user_id: "new-user" }, { rows: [], knownUsers: ["new-user"], knownUseCases: ucs.map((u) => u.id), knownEntities: [...new Set(ucs.map((u) => u.entity))], knownCountries: await knownCountryIds(orgId), by: who.id });
    if (!dry.ok) return bad(dry.error);
  }

  const password = randomBytes(12).toString("base64url");
  let id: string = randomUUID();
  const db = createAdminClient();
  if (!isOffline()) {
    const made = await (db as unknown as { auth: { admin: { createUser: (a: Record<string, unknown>) => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }> } } })
      .auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
    if (made.error || !made.data.user) return NextResponse.json({ error: made.error?.message ?? "The account could not be created" }, { status: 500 });
    id = made.data.user.id;
  }
  const { error: pe } = await db.from("profiles").upsert({ id, email, full_name: name, job_title, role: "employee", org_id: orgId }, { onConflict: "id" });
  if (pe) return NextResponse.json({ error: pe.message }, { status: 500 });
  let granted = false;
  if (grant) {
    const plan = planGrant({ ...grant, user_id: id }, { rows: await loadAssignmentRows(orgId), knownUsers: [id], knownUseCases: ucs.map((u) => u.id), knownEntities: [...new Set(ucs.map((u) => u.entity))], knownCountries: await knownCountryIds(orgId), by: who.id });
    if (plan.ok && plan.type === "grant") granted = !(await insertAssignment(orgId, plan.row));
  }
  if (text(b.item_id, 80)) await appendAgentLog(orgId, who.id, { item_id: text(b.item_id, 80), action: "user_created_by_person", outcome: "done", detail: { email, job_title, entity, role: role || null } });
  const swept = await sweepPeople(orgId);
  return NextResponse.json({ ok: true, id, email, granted, closed: swept.closed, ...(isOffline() ? { note: "Offline: no password. Use the Sign in as picker." } : { password }) });
}
