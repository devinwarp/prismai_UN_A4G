// The test roster: the federal and governance people, one entity admin and one test author per entity, and an operator per use case (five positions are left
// unfilled ON PURPOSE, so the People agent has something to raise). Every person has the job position the SOPs and approver lists match on. All names and
// addresses are fictitious (*.example). Pure: no I/O. Used by scripts/seed-test-accounts.mts (offline store and the hosted project) and its tests.

export type RosterRoleId = "platform_admin" | "governance_admin" | "entity_admin" | "process_owner" | "test_author" | "operator" | "viewer";
export type RosterScope = "org" | "country" | "entity" | "use_case";
export interface RosterRole { role: RosterRoleId; scope: RosterScope; /** the country id (country scope) or the entity name (entity scope) */ entity?: string; use_case?: string }
export interface RosterPerson { email: string; name: string; job_title: string; legacy: "employee" | "platform" | "viewer"; roles: RosterRole[]; federal?: string; why: string }

export const COUNTRY = "UAE";
export const ENTITIES: { name: string; slug: string }[] = [
  { name: "Marsa Public Services Authority", slug: "marsa" },
  { name: "Wahat Health Services Authority", slug: "wahat" },
  { name: "Sahel Federal Workforce Agency", slug: "sahel" },
  { name: "Qanat Transport and Mobility Agency", slug: "qanat" },
  { name: "Raya Education and Skills Council", slug: "raya" },
];

/** The operator's job position for each use case; a null name leaves the position unfilled (the People agent should raise it). */
export const OPERATORS: { uc: string; slug: string; title: string; name: string | null }[] = [
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
const ADMINS = ["Latifa Al Mansoori", "Hamdan Al Kaabi", "Shaikha Bin Saeed", "Mohammed Al Raisi", "Fatima Al Hosani"];
const AUTHORS = ["Yousef Al Ameri", "Amna Al Zaabi", "Rashid Haddad", "Wafa Al Maktoum", "Tariq Al Dhaheri"];

export function buildRoster(): RosterPerson[] {
  const r: RosterPerson[] = [
    { email: "super.admin@federal.example", name: "Hind Al Nuaimi", job_title: "Director, Federal AI Governance", legacy: "platform", federal: "Federal AI Governance",
      roles: [{ role: "platform_admin", scope: "org" }], why: "federal super admin: platform login, federal member, platform admin (the account behind FEDERAL_SUPER_USER_ID)" },
    { email: "platform.admin@federal.example", name: "Saeed Al Mehairi", job_title: "Platform Administrator", legacy: "employee",
      roles: [{ role: "platform_admin", scope: "org" }], why: "platform admin: assigns roles across the organisation" },
    // the governance admin's job title must be exactly "Head of AI governance": it is how the approver list names them
    { email: "ai.governance.uae@federal.example", name: "Dr. Mariam Al Hammadi", job_title: "Head of AI governance", legacy: "employee",
      roles: [{ role: "governance_admin", scope: "country", entity: COUNTRY }], why: "governance admin for the UAE: approves targets, test sets and verdict parameters for every UAE entity" },
    { email: "judge@demo.example", name: "Demo Judge", job_title: "Demo Judge", legacy: "viewer", roles: [], why: "the read-only judge account (the one-click demo entry uses it)" },
  ];
  ENTITIES.forEach((e, i) => {
    r.push({ email: `ai.director@${e.slug}.example`, name: ADMINS[i], job_title: "AI Programme Director", legacy: "employee",
      roles: [{ role: "entity_admin", scope: "entity", entity: e.name }], why: `entity admin of ${e.name}, ${COUNTRY}: sets up goals, use cases and SOPs and manages its people` });
    r.push({ email: `ai.quality@${e.slug}.example`, name: AUTHORS[i], job_title: "AI Quality and Test Lead", legacy: "employee",
      roles: [{ role: "test_author", scope: "entity", entity: e.name }], why: `test author for ${e.name}: proposes scenarios and tuning changes` });
  });
  for (const o of OPERATORS) {
    if (!o.name) continue;
    r.push({ email: `${dot(o.name)}@${o.slug}.example`, name: o.name, job_title: o.title, legacy: "employee", roles: [{ role: "operator", scope: "use_case", use_case: o.uc }], why: `operator of ${o.uc}` });
  }
  return r;
}

export const ROSTER: RosterPerson[] = buildRoster();
export const UNFILLED = OPERATORS.filter((o) => !o.name);

// ---- planning against what already exists (idempotent: running it twice changes nothing the second time) -------------------------------------------------

export interface ExistingProfile { id: string; email: string | null; job_title: string | null; role: string | null }
export interface ExistingAssignment { user_id: string; role: string; use_case_id: string | null; scope_entity?: string | null; scope_country?: string | null; revoked_at?: string | null }
export interface ExistingMember { user_id: string; body: string; removed_at?: string | null }
export interface PlannedGrant { email: string; role: RosterRoleId; use_case_id: string | null; scope_entity: string | null; scope_country: string | null; label: string }
export interface RosterPlan {
  /** people with no profile yet: an account is created for each */
  create: RosterPerson[];
  /** people who already exist: kept as they are (their login role is never changed); a missing job position is filled in */
  keep: { email: string; fillJobTitle: boolean }[];
  grants: PlannedGrant[];
  members: { email: string; body: string }[];
  /** roster use cases the organisation does not have: their operators are skipped */
  missingUseCases: string[];
}

export function planRoster(o: { profiles: ExistingProfile[]; assignments: ExistingAssignment[]; members: ExistingMember[]; useCases: { id: string; ext_id: string }[]; roster?: RosterPerson[] }): RosterPlan {
  const roster = o.roster ?? ROSTER;
  const byEmail = new Map(o.profiles.filter((p) => p.email).map((p) => [String(p.email).toLowerCase(), p]));
  const ucByExt = new Map(o.useCases.map((u) => [u.ext_id, u.id]));
  const plan: RosterPlan = { create: [], keep: [], grants: [], members: [], missingUseCases: [] };
  for (const p of roster) {
    const have = byEmail.get(p.email.toLowerCase());
    if (!have) plan.create.push(p);
    else plan.keep.push({ email: p.email, fillJobTitle: !have.job_title });
    for (const r of p.roles) {
      const uc = r.use_case ? ucByExt.get(r.use_case) ?? null : null;
      if (r.use_case && !uc) { if (!plan.missingUseCases.includes(r.use_case)) plan.missingUseCases.push(r.use_case); continue; }
      const scope_entity = r.scope === "entity" ? r.entity ?? null : null;
      const scope_country = r.scope === "country" ? r.entity ?? null : r.scope === "entity" ? COUNTRY : null;
      const already = have && o.assignments.some((a) => !a.revoked_at && a.user_id === have.id && a.role === r.role && (a.use_case_id ?? null) === uc
        && (a.scope_entity ?? null) === scope_entity && (a.scope_country ?? null) === scope_country);
      if (!already) plan.grants.push({ email: p.email, role: r.role, use_case_id: uc, scope_entity, scope_country, label: `${r.role}@${r.scope}${r.entity ? `:${r.entity}` : r.use_case ? `:${r.use_case}` : ""}` });
    }
    if (p.federal && !(have && o.members.some((m) => !m.removed_at && m.user_id === have.id && m.body.toLowerCase() === p.federal!.toLowerCase()))) plan.members.push({ email: p.email, body: p.federal });
  }
  return plan;
}
