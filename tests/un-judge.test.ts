import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildReplays, loadReplays } from "../src/lib/un/replay.ts";

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? routes(p) : f === "route.ts" ? [p] : [];
  });
}

test("every mutating /api/admin/un route is behind a guard: requireAdmin, or requirePermission (judges are viewers, so read-only)", () => {
  const files = routes("src/app/api/admin/un");
  assert.ok(files.length >= 8);
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      const at = src.search(new RegExp(`export async function ${m}\\b`));
      if (at < 0) continue;
      const rest = src.slice(at);
      const next = rest.slice(10).search(/export async function /);
      const body = next < 0 ? rest : rest.slice(0, next + 10);
      assert.match(body, /(requireAdmin\(\)|requirePermission\()/, `${f} ${m} must call requireAdmin() or requirePermission()`);
    }
  }
});

test("requireAdmin refuses viewers (the judge role) and keeps the read-only wording", () => {
  const src = readFileSync("src/lib/api-auth.ts", "utf8");
  assert.match(src, /who\.role !== "admin"/);
  assert.match(src, /Read-only access/);
});

test("judges are promoted to read-only viewers from JUDGE_EMAILS and never above", () => {
  const src = readFileSync("src/lib/auth.ts", "utf8");
  assert.match(src, /role: "viewer"/);
  assert.doesNotMatch(src.slice(src.indexOf("judgeEmails().includes")), /role: "admin"[^]{0,80}judge/);
});

test("replay is deterministic, every chain verifies, S1-S4 all present, and the recorded backup is current", async () => {
  const a = await buildReplays();
  const b = await buildReplays();
  assert.deepEqual(a, b);
  assert.deepEqual(a.runs.map((r) => r.scenario_id), ["S1", "S2", "S3", "S4"]);
  for (const r of a.runs) {
    assert.ok(r.chain_ok, r.scenario_id);
    assert.ok(r.steps.every((s) => s.match), `${r.scenario_id} steps match expected`);
  }
  assert.deepEqual(await loadReplays(), a, "run `npm run export-replay` to refresh public/replay/backup-run.json");
});

test("/replay is excluded from the session proxy", () => {
  assert.match(readFileSync("src/proxy.ts", "utf8"), /replay\(\?:\/\|\$\)/);
});

test("offline store round-trips inserts, filters and upserts", async () => {
  process.env.OFFLINE = "1";
  // scratch file in the OS temp dir (removed after), never in the repo
  const dir = mkdtempSync(path.join(tmpdir(), "judge-"));
  process.env.OFFLINE_DB = path.join(dir, "db.json");
  const { offlineClient, OFFLINE_ORG } = await import("../src/lib/supabase/offline.ts");
  const c = offlineClient();
  const { data: ucs } = (await c.from("un_use_cases").select("*").eq("org_id", OFFLINE_ORG).order("ext_id")) as { data: { ext_id: string }[] };
  assert.equal(ucs.length, 20);
  const ins = (await c.from("un_runs").insert({ org_id: OFFLINE_ORG, scenario_id: "S1" }).select("id").maybeSingle()) as { data: { id: string } };
  const got = (await c.from("un_runs").select("*").eq("id", ins.data.id).maybeSingle()) as { data: { scenario_id: string } };
  assert.equal(got.data.scenario_id, "S1");
  const { data: none } = await c.from("un_runs").select("id").eq("id", "nope").maybeSingle();
  assert.equal(none, null);
  assert.ok(existsSync(process.env.OFFLINE_DB), "the store file is where OFFLINE_DB says");
  assert.ok(!existsSync(path.join(process.cwd(), process.env.OFFLINE_DB)), "an absolute OFFLINE_DB is not glued onto the repo (no var/ folder)");
  delete process.env.OFFLINE_DB;
  rmSync(dir, { recursive: true, force: true });
});
