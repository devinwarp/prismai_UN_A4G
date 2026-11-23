// Read-only: do the goals stored in un_entities match ENTITY_GOALS in src/lib/un/goals.ts?
// The seed file is already checked against the code by tests/un-goals.test.ts; this checks the live rows.
// Usage: npm run check-entity-goals   (needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment)
import { ENTITY_GOALS } from "../src/lib/un/goals.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."); process.exit(2); }

const res = await fetch(`${url}/rest/v1/un_entities?select=org_id,name,goals`, { headers: { apikey: key, authorization: `Bearer ${key}` } });
if (!res.ok) { console.error(`Could not read un_entities: HTTP ${res.status}`); process.exit(2); }
const rows = (await res.json()) as { org_id: string; name: string; goals: unknown }[];

const problems: string[] = [];
for (const r of rows) {
  const code = ENTITY_GOALS[r.name];
  if (!code) { problems.push(`${r.name}: in the database, not in the code`); continue; }
  if (JSON.stringify(r.goals) !== JSON.stringify(code)) problems.push(`${r.name}: goals differ from ENTITY_GOALS`);
}
for (const name of Object.keys(ENTITY_GOALS)) if (!rows.some((r) => r.name === name)) problems.push(`${name}: in the code, not in the database`);

console.log(`${rows.length} entity rows checked against ${Object.keys(ENTITY_GOALS).length} in code`);
for (const p of problems) console.log(`  MISMATCH ${p}`);
if (problems.length) process.exit(1);
console.log("All entity goals match.");
