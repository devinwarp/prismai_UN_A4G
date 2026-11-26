// Seeds the test roster (src/lib/un/test-roster.ts): the federal and governance people, an entity admin and a test author per entity, and an operator per
// use case, each with the job position the SOPs match on. Five operator positions are left unfilled on purpose, for the People agent to raise.
//
//   node scripts/seed-test-accounts.mts                      OFFLINE demo store (OFFLINE_DB or .data/offline-db.json): writes it. Offline there are no passwords:
//                                                            use the "Sign in as" picker in the offline banner.
//   node scripts/seed-test-accounts.mts --plan               prints the roster, writes nothing.
//   node scripts/seed-test-accounts.mts --revoke-sql         prints the SQL that takes the test people's roles back (it runs nothing).
//   node scripts/seed-test-accounts.mts --hosted --check     READ-ONLY: is the SQL applied, and what exists on the hosted project?
//   node scripts/seed-test-accounts.mts --hosted             DRY RUN against the hosted project (.env.local): prints exactly what --apply would do, writes nothing.
//   node scripts/seed-test-accounts.mts --hosted --apply --credentials-out <file> [--reset-owners] [--org <uuid>]
//                                                            WRITES the hosted project: creates the missing accounts (confirmed, with a random password), their profiles,
//                                                            role assignments and the federal member. The passwords are written ONLY to <file>, which must be OUTSIDE this
//                                                            repository and must not exist yet. --reset-owners also gives the 20 fictitious process owners a new random
//                                                            password (same file). Passwords are never printed.
//
// --apply refuses to run unless supabase/un-scoped-roles.sql and supabase/un-agent-inbox.sql are applied (it checks). It is safe to run again: people who exist
// are kept (their login role is never changed, a missing job position is filled in), and a role that is already held is not granted twice.
import { randomBytes, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { planRoster, ROSTER, UNFILLED, type RosterPlan } from "../src/lib/un/test-roster.ts";

const argv = process.argv.slice(2);
const flag = (f: string) => argv.includes(f);
const arg = (f: string) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
const unfilled = `Unfilled positions (for the People agent): ${UNFILLED.map((o) => `${o.uc} ${o.title}`).join("; ")}`;

if (flag("--plan")) {
  for (const p of ROSTER) console.log(`${p.email.padEnd(46)} ${p.job_title.padEnd(44)} ${p.roles.map((r) => `${r.role}@${r.scope}${r.entity ? `:${r.entity}` : r.use_case ? `:${r.use_case}` : ""}`).join(", ")}`);
  console.log(`\n${ROSTER.length} people. ${unfilled}`);
  process.exit(0);
}

if (flag("--revoke-sql")) {
  // the exact SQL to take the test people's roles back (the process owners' roles are untouched); run it yourself in the SQL editor
  const emails = ROSTER.map((p) => `'${p.email}'`).join(", ");
  console.log(`update public.un_role_assignments set revoked_at = now()
 where revoked_at is null and role <> 'process_owner'
   and user_id in (select id from public.profiles where email in (${emails}));

update public.un_federal_members set removed_at = now()
 where removed_at is null and user_id in (select id from public.profiles where email in (${emails}));`);
  process.exit(0);
}

const show = (plan: RosterPlan) => {
  console.log(`  accounts to create : ${plan.create.length}${plan.create.length ? ` (${plan.create.map((p) => p.email).join(", ")})` : ""}`);
  console.log(`  already exist      : ${plan.keep.length}${plan.keep.filter((k) => k.fillJobTitle).length ? `, ${plan.keep.filter((k) => k.fillJobTitle).length} will get a job position` : ""}`);
  console.log(`  role assignments   : ${plan.grants.length}`);
  console.log(`  federal members    : ${plan.members.length}`);
  if (plan.missingUseCases.length) console.log(`  use cases not found, their operators skipped: ${plan.missingUseCases.join(", ")}`);
  console.log(`  ${unfilled}`);
};

// ------------------------------------------------------------------------------------------------------------------------------------------------
// offline
// ------------------------------------------------------------------------------------------------------------------------------------------------
if (!flag("--hosted")) {
  const file = path.resolve(process.cwd(), process.env.OFFLINE_DB ?? ".data/offline-db.json");
  if (!existsSync(file)) { console.error(`No offline database at ${file}. Start the app once with OFFLINE=1, then run this again.`); process.exit(1); }
  const db = JSON.parse(readFileSync(file, "utf8")) as Record<string, Record<string, unknown>[]>;
  const org = String(db.organizations?.[0]?.id);
  const now = new Date().toISOString();
  db.profiles ??= []; db.un_role_assignments ??= []; db.un_federal_members ??= [];
  const plan = planRoster({
    profiles: db.profiles.map((p) => ({ id: String(p.id), email: (p.email as string) ?? null, job_title: (p.job_title as string) ?? null, role: (p.role as string) ?? null })),
    assignments: db.un_role_assignments as never, members: db.un_federal_members as never,
    useCases: (db.un_use_cases ?? []).filter((u) => u.org_id === org).map((u) => ({ id: String(u.id), ext_id: String(u.ext_id) })),
  });
  const ids = new Map<string, string>();
  for (const p of db.profiles) if (p.email) ids.set(String(p.email).toLowerCase(), String(p.id));
  for (const p of plan.create) {
    const id = randomUUID(); ids.set(p.email.toLowerCase(), id);
    db.profiles.push({ id, email: p.email, full_name: p.name, job_title: p.job_title, role: p.legacy, org_id: org, created_at: now });
  }
  for (const k of plan.keep.filter((x) => x.fillJobTitle)) {
    const row = db.profiles.find((p) => String(p.email).toLowerCase() === k.email.toLowerCase()); const want = ROSTER.find((r) => r.email === k.email);
    if (row && want) row.job_title = want.job_title;
  }
  for (const g of plan.grants) {
    db.un_role_assignments.push({ id: randomUUID(), created_at: now, org_id: org, user_id: ids.get(g.email.toLowerCase()), role: g.role, use_case_id: g.use_case_id,
      scope_entity: g.scope_entity, scope_country: g.scope_country, granted_by: null, granted_at: now, revoked_at: null, revoked_by: null });
  }
  for (const m of plan.members) db.un_federal_members.push({ id: randomUUID(), org_id: org, body: m.body, user_id: ids.get(m.email.toLowerCase()), added_by: null, added_at: now, removed_at: null, removed_by: null });
  writeFileSync(file, JSON.stringify(db));
  console.log(`offline store ${file}: ${plan.create.length} people created, ${plan.grants.length} role assignments, ${plan.members.length} federal member(s). ${unfilled}.`);
  process.exit(0);
}

// ------------------------------------------------------------------------------------------------------------------------------------------------
// hosted
// ------------------------------------------------------------------------------------------------------------------------------------------------
const env: Record<string, string> = {};
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(?:\s#.*)?$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed in .env.local"); process.exit(1); }
const H = { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" };
const api = async (method: string, p: string, body?: unknown, extra: Record<string, string> = {}) => {
  const r = await fetch(`${url}${p}`, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${p.split("?")[0]}: ${r.status} ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : null;
};
console.log(`${flag("--apply") ? "APPLY" : flag("--check") ? "CHECK (read-only)" : "DRY RUN"} against ${new URL(url).host}`);

// 1. is the SQL applied? (the REST schema description lists the tables and columns)
const defs = ((await api("GET", "/rest/v1/")) as { definitions?: Record<string, { properties?: Record<string, unknown> }> }).definitions ?? {};
const cols = (t: string) => new Set(Object.keys(defs[t]?.properties ?? {}));
const wanted: [string, string[]][] = [
  ["un_role_assignments", ["scope_country", "scope_entity"]], ["un_inbox_items", ["dedupe_key", "handler", "status"]], ["un_raci_overrides", ["step", "letter"]],
  ["un_agent_settings", ["enabled", "daily_cap"]], ["un_agent_log", ["hash", "prev_hash"]], ["un_federal_members", ["body", "user_id"]],
];
const missing = wanted.flatMap(([t, cs]) => (!defs[t] ? [`table ${t}`] : cs.filter((c) => !cols(t).has(c)).map((c) => `column ${t}.${c}`)));
console.log(missing.length ? `SQL NOT fully applied. Missing: ${missing.join(", ")}` : "SQL applied: scope columns, inbox, RACI, agent tables and federal members are all present.");
if (missing.length && flag("--apply")) { console.error("Refusing to --apply: apply supabase/un-scoped-roles.sql and supabase/un-agent-inbox.sql first. Nothing was changed."); process.exit(3); }

// 2. what exists, and the plan
const org = arg("--org") ?? ((await api("GET", "/rest/v1/organizations?select=id&limit=1")) as { id: string }[])[0]?.id;
if (!org) { console.error("No organisation found; pass --org <uuid>"); process.exit(1); }
const q = (p: string) => api("GET", p) as Promise<Record<string, unknown>[]>;
const [profiles, assignments, ucs] = await Promise.all([
  q(`/rest/v1/profiles?select=id,email,job_title,role&org_id=eq.${org}`), q(`/rest/v1/un_role_assignments?select=*&org_id=eq.${org}&revoked_at=is.null`), q(`/rest/v1/un_use_cases?select=id,ext_id&org_id=eq.${org}`),
]);
const members = defs.un_federal_members ? await q(`/rest/v1/un_federal_members?select=user_id,body,removed_at&org_id=eq.${org}`) : [];
const plan = planRoster({ profiles: profiles as never, assignments: assignments as never, members: members as never, useCases: ucs as never });
console.log(`organisation ${org}: ${profiles.length} profiles, ${ucs.length} use cases`);
show(plan);

const ownersFile = JSON.parse(readFileSync("data/un-process-owners.json", "utf8")) as { owners: { email: string; job_title: string }[] };
const owners = ownersFile.owners.map((o) => ({ ...o, profile: (profiles as { id: string; email: string }[]).find((p) => String(p.email).toLowerCase() === o.email.toLowerCase()) })).filter((o) => o.profile);
if (flag("--reset-owners")) console.log(`  process-owner passwords to reset: ${owners.length} of ${ownersFile.owners.length} (those with an account)`);
if (flag("--check") || !flag("--apply")) { console.log(flag("--check") ? "" : "\nDry run: nothing was written. Add --apply --credentials-out <file outside the repository> to write."); process.exit(0); }

// 3. apply
const out = arg("--credentials-out");
if (!out) { console.error("--apply needs --credentials-out <file>: the passwords are written only there. Nothing was changed."); process.exit(2); }
const outPath = path.resolve(out);
const rel = path.relative(process.cwd(), outPath);
if (!rel.startsWith("..") && !path.isAbsolute(rel)) { console.error(`The credentials file must be OUTSIDE this repository (${outPath} is inside it). Nothing was changed.`); process.exit(2); }
if (existsSync(outPath)) { console.error(`${outPath} already exists: choose a new file so no earlier credentials are overwritten. Nothing was changed.`); process.exit(2); }
writeFileSync(outPath, "email,password,job_title,roles\n", { flag: "wx", mode: 0o600 });
const csv = (email: string, password: string, title: string, roles: string) => appendFileSync(outPath, [email, password, title, roles].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",") + "\n");
const password = () => randomBytes(15).toString("base64url");
const rolesOf = (email: string) => ROSTER.find((p) => p.email === email)?.roles.map((r) => `${r.role}${r.entity ? `:${r.entity}` : r.use_case ? `:${r.use_case}` : ""}`).join("; ") ?? "";
const ids = new Map((profiles as { id: string; email: string }[]).filter((p) => p.email).map((p) => [String(p.email).toLowerCase(), p.id]));
const now = new Date().toISOString();
let step = "creating accounts";
try {
  for (const p of plan.create) {
    const pw = password();
    const made = (await api("POST", "/auth/v1/admin/users", { email: p.email, password: pw, email_confirm: true, user_metadata: { full_name: p.name } })) as { id: string };
    csv(p.email, pw, p.job_title, rolesOf(p.email)); // written at once: a later failure must not lose a password
    ids.set(p.email.toLowerCase(), made.id);
    await api("POST", "/rest/v1/profiles?on_conflict=id", { id: made.id, email: p.email, full_name: p.name, job_title: p.job_title, role: p.legacy, org_id: org }, { Prefer: "resolution=merge-duplicates,return=minimal" });
  }
  step = "filling job positions";
  for (const k of plan.keep.filter((x) => x.fillJobTitle)) {
    const want = ROSTER.find((r) => r.email === k.email);
    if (want) await api("PATCH", `/rest/v1/profiles?id=eq.${ids.get(k.email.toLowerCase())}`, { job_title: want.job_title }, { Prefer: "return=minimal" });
  }
  step = "granting roles";
  for (const g of plan.grants) {
    await api("POST", "/rest/v1/un_role_assignments", { org_id: org, user_id: ids.get(g.email.toLowerCase()), role: g.role, use_case_id: g.use_case_id, scope_country: g.scope_country, scope_entity: g.scope_entity, granted_at: now }, { Prefer: "return=minimal" });
  }
  step = "adding the federal member";
  for (const m of plan.members) await api("POST", "/rest/v1/un_federal_members", { org_id: org, body: m.body, user_id: ids.get(m.email.toLowerCase()), added_at: now }, { Prefer: "return=minimal" });
  if (flag("--reset-owners")) {
    step = "resetting the process owners' passwords";
    for (const o of owners) {
      const pw = password();
      await api("PUT", `/auth/v1/admin/users/${(o.profile as { id: string }).id}`, { password: pw });
      csv(o.email, pw, o.job_title, "process_owner (password reset)");
    }
  }
} catch (e) {
  console.error(`STOPPED while ${step}: ${(e as Error).message}\nWhat was done is kept (and any passwords are in ${outPath}). Fix the cause and run the same command with a NEW --credentials-out file: it picks up where this stopped.`);
  process.exit(4);
}
console.log(`Done. ${plan.create.length} accounts created, ${plan.grants.length} role assignments, ${plan.members.length} federal member(s)${flag("--reset-owners") ? `, ${owners.length} owner passwords reset` : ""}.`);
console.log(`Credentials written to ${outPath} (not in the repository; share it only with the people who test, then delete it).`);
