// Seeds the test roster: the federal and governance people, one entity admin and one test author per entity, and an operator per use case (some positions are
// left unfilled ON PURPOSE, so the People agent has something to raise). Every person has the job position the SOPs and approver lists match on.
//
//   node scripts/seed-test-accounts.mts             OFFLINE demo store (OFFLINE_DB or .data/offline-db.json): writes it. Offline there are no passwords: use
//                                                    the "Sign in as" picker in the offline banner.
//   node scripts/seed-test-accounts.mts --plan      prints the roster, writes nothing.
//
// The hosted project is NOT supported yet: the scoped roles need supabase/un-scoped-roles.sql (Shameer applies it), and the accounts there need real
// sign-in credentials, which are generated into a file outside the repository when that step is run (see the notes in docs/un-people-and-inbox.md).
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

if (process.argv.includes("--hosted")) {
  console.error("Hosted is not supported yet: apply supabase/un-scoped-roles.sql first (Shameer), then the hosted step is added. Nothing was changed.");
  process.exit(2);
}

type Role = "platform_admin" | "governance_admin" | "entity_admin" | "process_owner" | "test_author" | "operator" | "viewer";
interface Person { email: string; name: string; job_title: string; legacy: "employee" | "platform" | "viewer"; roles: { role: Role; scope: "org" | "country" | "entity" | "use_case"; entity?: string; use_case?: string }[]; federal?: string; why: string }

const ENTITIES: { name: string; slug: string }[] = [
  { name: "Marsa Public Services Authority", slug: "marsa" },
  { name: "Wahat Health Services Authority", slug: "wahat" },
  { name: "Sahel Federal Workforce Agency", slug: "sahel" },
  { name: "Qanat Transport and Mobility Agency", slug: "qanat" },
  { name: "Raya Education and Skills Council", slug: "raya" },
];
const COUNTRY = "UAE";

// the operator's job position for each use case; a null name leaves the position unfilled (the People agent should raise it)
const OPERATORS: { uc: string; slug: string; title: string; name: string | null }[] = [
  { uc: "UC01", slug: "marsa", title: "Licensing Contact Centre Supervisor", name: "Maitha Al Ketbi" },
  { uc: "UC02", slug: "marsa", title: "Licensing Supervisor", name: "Obaid Al Shamsi" },
  { uc: "UC03", slug: "marsa", title: "Inspection Operations Coordinator", name: "Shamma Al Dhaheri" },
  { uc: "UC04", slug: "marsa", title: "Regulatory Procedures Officer", name: null },
  { uc: "UC05", slug: "wahat", title: "Patient Services Operations Supervisor", name: "Reem Haddad" },
  { uc: "UC06", slug: "wahat", title: "Procurement Operations Analyst", name: "Faisal Nasser" },
  { uc: "UC07", slug: "wahat", title: "Clinical Governance Officer", name: null },
  { uc: "UC08", slug: "wahat", title: "Public Health Communications Officer", name: "Huda Tabbara" },
  { uc: "UC09", slug: "sahel", title: "Talent Acquisition Specialist", name: "Ahmed Al Falasi" },
  { uc: "UC10", slug: "sahel", title: "HR Shared Services Supervisor", name: "Lubna Mansour" },
  { uc: "UC11", slug: "sahel", title: "Workforce Planning Analyst", name: null },
  { uc: "UC12", slug: "sahel", title: "Employment Services Supervisor", name: "Zayed Al Blooshi" },
  { uc: "UC13", slug: "qanat", title: "Customer Service and Enforcement Supervisor", name: "Noor Al Suwaidi" },
  { uc: "UC14", slug: "qanat", title: "Fleet Maintenance Planner", name: "Khalifa Karam" },
  { uc: "UC15", slug: "qanat", title: "Operations Control Duty Officer", name: null },
  { uc: "UC16", slug: "qanat", title: "Permits Operations Officer", name: "Aisha Al Mazrouei" },
  { uc: "UC17", slug: "raya", title: "Admissions Officer", name: "Salem Qasim" },
  { uc: "UC18", slug: "raya", title: "Legal Monitoring Analyst", name: "Mouza Barakat" },
  { uc: "UC19", slug: "raya", title: "IT Service Desk Lead", name: null },
  { uc: "UC20", slug: "raya", title: "Education Policy Analyst", name: "Rashed Al Marri" },
];
const dot = (n: string) => n.toLowerCase().replace(/[^a-z ]/g, "").trim().replace(/\s+/g, ".");

const roster: Person[] = [];
roster.push({ email: "super.admin@federal.example", name: "Hind Al Nuaimi", job_title: "Director, Federal AI Governance", legacy: "platform", federal: "Federal AI Governance",
  roles: [{ role: "platform_admin", scope: "org" }], why: "federal super admin: platform login, federal member, platform admin (the account behind FEDERAL_SUPER_USER_ID)" });
roster.push({ email: "platform.admin@federal.example", name: "Saeed Al Mehairi", job_title: "Platform Administrator", legacy: "employee",
  roles: [{ role: "platform_admin", scope: "org" }], why: "platform admin: assigns roles across the organisation" });
roster.push({ email: "ai.governance.uae@federal.example", name: "Dr. Mariam Al Hammadi", job_title: "Head of AI governance", legacy: "employee",
  roles: [{ role: "governance_admin", scope: "country", entity: COUNTRY }], why: "governance admin for the UAE: approves targets, test sets and verdict parameters for every UAE entity" });
roster.push({ email: "judge@demo.example", name: "Demo Judge", job_title: "Demo Judge", legacy: "viewer", roles: [], why: "the read-only judge account" });
const admins = ["Latifa Al Mansoori", "Hamdan Al Kaabi", "Shaikha Bin Saeed", "Mohammed Al Raisi", "Fatima Al Hosani"];
const authors = ["Yousef Al Ameri", "Amna Al Zaabi", "Rashid Haddad", "Wafa Al Maktoum", "Tariq Al Dhaheri"];
ENTITIES.forEach((e, i) => {
  roster.push({ email: `ai.director@${e.slug}.example`, name: admins[i], job_title: "AI Programme Director", legacy: "employee",
    roles: [{ role: "entity_admin", scope: "entity", entity: e.name }], why: `entity admin of ${e.name}, ${COUNTRY}: sets up goals, use cases and SOPs and manages its people` });
  roster.push({ email: `ai.quality@${e.slug}.example`, name: authors[i], job_title: "AI Quality and Test Lead", legacy: "employee",
    roles: [{ role: "test_author", scope: "entity", entity: e.name }], why: `test author for ${e.name}: proposes scenarios and tuning changes` });
});
for (const o of OPERATORS) {
  if (!o.name) continue;
  roster.push({ email: `${dot(o.name)}@${o.slug}.example`, name: o.name, job_title: o.title, legacy: "employee",
    roles: [{ role: "operator", scope: "use_case", use_case: o.uc }], why: `operator of ${o.uc}` });
}
const unfilled = OPERATORS.filter((o) => !o.name);

if (process.argv.includes("--plan")) {
  for (const p of roster) console.log(`${p.email.padEnd(46)} ${p.job_title.padEnd(44)} ${p.roles.map((r) => `${r.role}@${r.scope}${r.entity ? `:${r.entity}` : r.use_case ? `:${r.use_case}` : ""}`).join(", ")}`);
  console.log(`\n${roster.length} people. Unfilled positions (for the People agent): ${unfilled.map((o) => `${o.uc} ${o.title}`).join("; ")}`);
  process.exit(0);
}

const file = path.resolve(process.cwd(), process.env.OFFLINE_DB ?? ".data/offline-db.json");
if (!existsSync(file)) { console.error(`No offline database at ${file}. Start the app once with OFFLINE=1, then run this again.`); process.exit(1); }
const db = JSON.parse(readFileSync(file, "utf8")) as Record<string, Record<string, unknown>[]>;
const org = String(db.organizations?.[0]?.id);
const now = new Date().toISOString();
db.profiles ??= []; db.un_role_assignments ??= []; db.un_federal_members ??= [];
let people = 0, roles = 0, members = 0;
for (const p of roster) {
  let row = db.profiles.find((x) => x.email === p.email);
  if (!row) { row = { id: randomUUID(), email: p.email, full_name: p.name, job_title: p.job_title, role: p.legacy, org_id: org, created_at: now }; db.profiles.push(row); people++; }
  else { row.job_title = p.job_title; row.full_name = row.full_name ?? p.name; row.role = p.legacy; }
  for (const r of p.roles) {
    const uc = r.use_case ? db.un_use_cases?.find((u) => u.ext_id === r.use_case && u.org_id === org) : null;
    if (r.use_case && !uc) continue;
    const match = (a: Record<string, unknown>) => a.user_id === row!.id && a.role === r.role && !a.revoked_at
      && (a.use_case_id ?? null) === (uc?.id ?? null) && (a.scope_entity ?? null) === (r.scope === "entity" ? r.entity : null) && (a.scope_country ?? null) === (r.scope === "country" ? r.entity : r.scope === "entity" ? COUNTRY : null);
    if (db.un_role_assignments.some(match)) continue;
    db.un_role_assignments.push({ id: randomUUID(), created_at: now, org_id: org, user_id: row.id, role: r.role, use_case_id: uc?.id ?? null,
      scope_entity: r.scope === "entity" ? r.entity : null, scope_country: r.scope === "country" ? r.entity : r.scope === "entity" ? COUNTRY : null,
      granted_by: null, granted_at: now, revoked_at: null, revoked_by: null });
    roles++;
  }
  if (p.federal && !db.un_federal_members.some((m) => m.user_id === row!.id && !m.removed_at)) {
    db.un_federal_members.push({ id: randomUUID(), org_id: org, body: p.federal, user_id: row.id, added_by: null, added_at: now, removed_at: null, removed_by: null });
    members++;
  }
}
writeFileSync(file, JSON.stringify(db));
console.log(`offline store ${file}: ${people} people created, ${roles} role assignments, ${members} federal member(s). Unfilled positions: ${unfilled.map((o) => `${o.uc} ${o.title}`).join("; ")}.`);
