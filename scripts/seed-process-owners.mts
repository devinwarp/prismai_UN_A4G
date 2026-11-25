// Seeds the fictitious business process owners (data/un-process-owners.json): for each use case, a person (a profile with a job title)
// and a live `process_owner` role on that use case. Safe to run again: a person found by email is reused, and a role that is already live is skipped.
//
//   node scripts/seed-process-owners.mts                    OFFLINE demo store (OFFLINE_DB or .data/offline-db.json): writes it.
//   node scripts/seed-process-owners.mts --hosted           HOSTED Supabase (.env.local): DRY RUN, prints what it would do.
//   node scripts/seed-process-owners.mts --hosted --apply   HOSTED: creates the accounts, profiles and role assignments.
//
// Hosted needs supabase/un-roles.sql applied (un_role_assignments). A hosted person must exist as an auth user (profiles.id references auth.users),
// so --apply creates one per owner with a confirmed fictitious address and a random password nobody is told: they cannot sign in until a
// password reset or a magic link is sent to a real address you set for them. Nothing here sends mail.
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

interface Owner { use_case: string; entity: string; name: string; job_title: string; department: string; email: string }
const owners = (JSON.parse(readFileSync("data/un-process-owners.json", "utf8")) as { owners: Owner[] }).owners;
const hosted = process.argv.includes("--hosted");
const apply = process.argv.includes("--apply");
const orgArg = process.argv.includes("--org") ? process.argv[process.argv.indexOf("--org") + 1] : null;

if (!hosted) {
  const file = path.resolve(process.cwd(), process.env.OFFLINE_DB ?? ".data/offline-db.json");
  if (!existsSync(file)) { console.error(`No offline database at ${file}. Start the app once with OFFLINE=1, then run this again.`); process.exit(1); }
  const db = JSON.parse(readFileSync(file, "utf8")) as Record<string, Record<string, unknown>[]>;
  const org = String(db.organizations?.[0]?.id);
  const now = new Date().toISOString();
  db.profiles ??= []; db.un_role_assignments ??= [];
  let people = 0, roles = 0;
  const missing: string[] = [];
  for (const o of owners) {
    const uc = (db.un_use_cases ?? []).find((u) => u.ext_id === o.use_case && u.org_id === org);
    if (!uc) { missing.push(o.use_case); continue; }
    let p = db.profiles.find((x) => x.email === o.email);
    if (!p) { p = { id: randomUUID(), email: o.email, full_name: o.name, job_title: o.job_title, role: "employee", org_id: org, created_at: now }; db.profiles.push(p); people++; }
    const live = db.un_role_assignments.some((a) => a.user_id === p!.id && a.role === "process_owner" && a.use_case_id === uc.id && !a.revoked_at);
    if (!live) { db.un_role_assignments.push({ id: randomUUID(), created_at: now, org_id: org, user_id: p.id, role: "process_owner", use_case_id: uc.id, granted_by: null, granted_at: now, revoked_at: null, revoked_by: null }); roles++; }
  }
  writeFileSync(file, JSON.stringify(db));
  console.log(`offline store ${file}: ${people} people created, ${roles} process-owner roles granted${missing.length ? `; no use case found for ${missing.join(", ")}` : ""}.`);
  process.exit(0);
}

const env: Record<string, string> = {};
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(?:\s#.*)?$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed in .env.local"); process.exit(1); }
const H = { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" };
const api = async (method: string, p: string, body?: unknown, extra: Record<string, string> = {}) => {
  const r = await fetch(`${url}${p}`, { method, headers: { ...H, ...extra }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${p}: ${r.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
};
const org = orgArg ?? ((await api("GET", "/rest/v1/organizations?select=id&limit=1")) as { id: string }[])[0]?.id;
if (!org) { console.error("No organisation found; pass --org <uuid>"); process.exit(1); }
const ucs = (await api("GET", `/rest/v1/un_use_cases?select=id,ext_id&org_id=eq.${org}`)) as { id: string; ext_id: string }[];
console.log(`${apply ? "APPLYING" : "DRY RUN"} against ${new URL(url).host}, organisation ${org}, ${ucs.length} use cases found.`);
for (const o of owners) {
  const uc = ucs.find((u) => u.ext_id === o.use_case);
  if (!uc) { console.log(`${o.use_case}: no such use case, skipped`); continue; }
  const found = (await api("GET", `/rest/v1/profiles?select=id&email=eq.${encodeURIComponent(o.email)}`)) as { id: string }[];
  let id = found[0]?.id;
  const live = id ? ((await api("GET", `/rest/v1/un_role_assignments?select=id&user_id=eq.${id}&role=eq.process_owner&use_case_id=eq.${uc.id}&revoked_at=is.null`)) as unknown[]).length > 0 : false;
  console.log(`${o.use_case}  ${o.name.padEnd(30)} ${o.job_title.padEnd(46)} ${id ? "person exists" : "new person"}, ${live ? "role already live" : "role to grant"}`);
  if (!apply) continue;
  if (!id) {
    const u = (await api("POST", "/auth/v1/admin/users", { email: o.email, email_confirm: true, password: randomBytes(24).toString("base64url"), user_metadata: { full_name: o.name } })) as { id: string };
    id = u.id;
  }
  await api("POST", "/rest/v1/profiles", { id, email: o.email, full_name: o.name, job_title: o.job_title, role: "employee", org_id: org }, { Prefer: "resolution=merge-duplicates" });
  if (!live) await api("POST", "/rest/v1/un_role_assignments", { org_id: org, user_id: id, role: "process_owner", use_case_id: uc.id });
}
console.log(apply ? "done." : "Nothing was written. Run again with --apply to create them.");
