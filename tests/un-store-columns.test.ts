import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

// The offline store accepts any column name, so a wrong one passes every other test and fails only on the real
// database (found live: roles-store selected un_use_cases.use_case; the column is `title`). This reads the SQL and
// checks the columns the new stores name.

const sql = readdirSync("supabase").filter((f) => f.endsWith(".sql")).map((f) => readFileSync(`supabase/${f}`, "utf8")).join("\n");
function columns(table: string): Set<string> {
  const m = sql.match(new RegExp(`create table (?:if not exists )?public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`));
  assert.ok(m, `${table} is in the SQL`);
  const cols = new Set<string>();
  for (const line of m[1].split("\n")) { const c = line.trim().match(/^([a-z_]+)\s+[a-z]/); if (c && !["primary", "unique", "check", "constraint", "foreign"].includes(c[1])) cols.add(c[1]); }
  for (const a of sql.matchAll(new RegExp(`alter table public\\.${table}\\s+add column (?:if not exists )?([a-z_]+)`, "g"))) cols.add(a[1]);
  return cols;
}
const selected = (file: string, table: string): string[] => {
  const src = readFileSync(file, "utf8");
  return [...src.matchAll(new RegExp(`from\\("${table}"\\)\\s*\\.select\\("([^"*]+)"`, "g"))].flatMap((m) => m[1].split(",").map((c) => c.trim()));
};

test("roles-store reads only columns that exist", () => {
  for (const [table, file] of [["un_use_cases", "src/lib/un/roles-store.ts"], ["un_role_assignments", "src/lib/un/roles-store.ts"], ["profiles", "src/lib/un/roles-store.ts"]] as const) {
    const have = columns(table);
    for (const c of selected(file, table)) assert.ok(have.has(c), `${table}.${c} does not exist`);
  }
});

test("pilot reports: the light column list names real columns and leaves out the run records", () => {
  const src = readFileSync("src/lib/un/pilot-store.ts", "utf8");
  const light = src.match(/const LIGHT = "([^"]+)"/)![1].split(",").map((c) => c.trim());
  const have = columns("un_lifecycle_pilot_reports");
  for (const c of light) assert.ok(have.has(c), `un_lifecycle_pilot_reports.${c} does not exist`);
  assert.ok(!light.includes("run_records"));
});

test("goal-review log: every column the store writes exists; the goal set lives in the payload, so no column was added", () => {
  const have = columns("un_goal_review_log");
  const src = readFileSync("src/lib/un/pilot-store.ts", "utf8");
  const insert = src.match(/from\("un_goal_review_log"\)\.insert\(\{([^}]+)\}/)![1].split(",").map((c) => c.trim().split(":")[0].trim());
  for (const c of insert) assert.ok(have.has(c), `un_goal_review_log.${c} does not exist`);
  assert.ok(!have.has("goal_set"));
  const reportInsert = src.match(/from\("un_lifecycle_pilot_reports"\)\.insert\(\{([^}]+)\}/)![1].split(",").map((c) => c.trim().split(":")[0].trim());
  const cols = columns("un_lifecycle_pilot_reports");
  for (const c of reportInsert) assert.ok(cols.has(c), `un_lifecycle_pilot_reports.${c} does not exist`);
});

test("testgen log: every column the store reads and writes exists, kinds match the SQL check, and the table is append-only", () => {
  const have = columns("un_testgen_log");
  const src = readFileSync("src/lib/un/testgen.ts", "utf8");
  const insert = src.match(/from\("un_testgen_log"\)\.insert\(\{([^}]+)\}/)![1].split(",").map((c) => c.trim().split(":")[0].trim());
  for (const c of insert) assert.ok(have.has(c), `un_testgen_log.${c} does not exist`);
  for (const c of ["org_id", "use_case_id", "profile"]) assert.ok(have.has(c), c);
  assert.match(src, /from\("un_testgen_log"\)\.select\("\*"\)/);
  const kinds = sql.match(/un_testgen_log[\s\S]*?kind text not null check \(kind in \(([^)]+)\)\)/)![1].replace(/'/g, "").split(",").map((k) => k.trim());
  assert.deepEqual(kinds, ["generated", "rejected", "ruled"]);
  assert.match(src, /type GenKind = "generated" \| "rejected" \| "ruled"/);
  assert.match(sql, /un_testgen_log_no_update before update/);
  assert.match(sql, /un_testgen_log_no_delete before delete/);
  assert.ok(!/un_testgen_log/.test(readFileSync("supabase/schema.sql", "utf8")) && !/un_testgen_log/.test(readFileSync("supabase/un-federal.sql", "utf8")), "schema.sql and un-federal.sql are untouched");
});
