import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileKbStore, seedStore, type KbStore } from "../src/lib/un/kb-store.ts";
import { supabaseKbStore, type SupabaseLike } from "../src/lib/un/kb-store-supabase.ts";
import { appendEntry } from "../src/lib/un/tuning.ts";
import type { TuningEntry } from "../src/lib/un/tuning-versions.ts";

type Row = Record<string, unknown>;

/** A mocked Supabase client: records every call, keeps rows per table, enforces the log's primary key. */
function mockClient() {
  const tables: Record<string, Row[]> = {};
  const calls: string[] = [];
  const client: SupabaseLike = {
    from(table: string) {
      const rows = (tables[table] ??= []);
      let op: "select" | "upsert" | "insert" | "delete" = "select";
      const filters: [string, unknown][] = [];
      let payload: Row[] = [];
      let conflict = "";
      let sort: [string, boolean] | null = null;
      let max = Infinity;
      const q: Record<string, unknown> = {};
      const run = (): { data: unknown; error: { message: string } | null } => {
        calls.push(`${op} ${table} ${filters.map(([c]) => c).join(",")}`);
        const match = (r: Row) => filters.every(([c, v]) => r[c] === v);
        if (op === "insert") {
          if (table === "un_kb_log" && payload.some((p) => rows.some((r) => r.org_id === p.org_id && r.seq === p.seq))) return { data: null, error: { message: "duplicate key value violates unique constraint" } };
          rows.push(...payload);
          return { data: null, error: null };
        }
        if (op === "upsert") {
          const keys = conflict.split(",");
          for (const p of payload) { const i = rows.findIndex((r) => keys.every((k) => r[k] === p[k])); if (i >= 0) rows[i] = p; else rows.push(p); }
          return { data: null, error: null };
        }
        if (op === "delete") { for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i])) rows.splice(i, 1); return { data: null, error: null }; }
        let out = rows.filter(match);
        if (sort) out = [...out].sort((a, b) => (String(a[sort![0]]) < String(b[sort![0]]) ? -1 : 1) * (sort![1] ? 1 : -1));
        return { data: out.slice(0, max), error: null };
      };
      Object.assign(q, {
        select: () => q, limit: (n: number) => { max = n; return q; },
        eq: (c: string, v: unknown) => { filters.push([c, v]); return q; },
        order: (c: string, o?: { ascending: boolean }) => { sort = [c, o?.ascending ?? true]; return q; },
        upsert: (r: unknown, o?: { onConflict: string }) => { op = "upsert"; payload = [r].flat() as Row[]; conflict = o?.onConflict ?? ""; return q; },
        insert: (r: unknown) => { op = "insert"; payload = [r].flat() as Row[]; return q; },
        delete: () => { op = "delete"; return q; },
        then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
      });
      return q as never;
    },
  };
  return { client, tables, calls };
}

const ORG = "00000000-0000-4000-8000-000000000001";
const entry = (prev: TuningEntry | null, n: number) => appendEntry(prev, "bank_edit", "ana", { n }, `2026-11-21T10:0${n}:00.000Z`);

async function contract(store: KbStore) {
  await seedStore(store, "SOP-LIC-014");
  const sop = await store.getSop("SOP-LIC-014");
  assert.equal(sop?.synthetic, true);
  const chunks = await store.listChunks("SOP-LIC-014");
  assert.ok(chunks.length > 40);
  const emb = chunks.filter((c) => c.embedding);
  assert.ok(emb.length === chunks.length && emb[0].embedding!.length === 768, "768-dimension embeddings survive the round trip");
  assert.equal((await store.listQuestions("SOP-LIC-014")).length, 21);

  await store.putConfig({ id: "retrieval@v1", target: "retrieval", version: 1, status: "proposed", value: { a: 1 }, summary: "s", created_by: "ana", created_at: "2026-11-21T10:00:00.000Z", decided_by: null, decided_at: null });
  await store.putConfig({ id: "retrieval@v1", target: "retrieval", version: 1, status: "approved", value: { a: 1 }, summary: "s", created_by: "ana", created_at: "2026-11-21T10:00:00.000Z", decided_by: "bo", decided_at: "2026-11-21T10:05:00.000Z" });
  const cfgs = await store.listConfigs("retrieval");
  assert.equal(cfgs.length, 1);
  assert.equal(cfgs[0].status, "approved");
  assert.deepEqual(await store.listConfigs("skill:x"), []);

  await store.saveRun({ id: "r1", sop_id: "SOP-LIC-014", kind: "questions", config_version: 0, at: "2026-11-21T10:00:00.000Z", actor: "ana", summary: {}, results: [] });
  await store.saveRun({ id: "r2", sop_id: "SOP-LIC-014", kind: "tasks", config_version: 0, at: "2026-11-21T11:00:00.000Z", actor: "ana", summary: {}, results: [] });
  assert.deepEqual((await store.listRuns("SOP-LIC-014")).map((r) => r.id), ["r2", "r1"]);

  const e1 = entry(null, 1), e2 = entry(e1, 2);
  await store.appendLog([e1]);
  await store.appendLog([e2]);
  assert.deepEqual((await store.getLog()).map((e) => e.seq), [1, 2]);
  await assert.rejects(store.appendLog([e2]), /append-only/, "a repeated seq is refused");
  await assert.rejects(store.appendLog([entry(null, 3)]), /append-only/, "a fork is refused");
  assert.equal((await store.getLog()).length, 2);
  assert.deepEqual((await store.getLog())[1], e2, "entries round-trip exactly, so the hash still verifies");
}

test("file store: the full contract, in a temp file", async () => {
  await contract(fileKbStore(path.join(mkdtempSync(path.join(tmpdir(), "kbs-")), "kb.json")));
});

test("supabase store: the same contract against a mocked client, scoped to one organisation", async () => {
  const { client, tables, calls } = mockClient();
  await contract(supabaseKbStore(client, ORG));
  for (const [t, rows] of Object.entries(tables)) for (const r of rows) assert.equal(r.org_id, ORG, `${t} row without the org`);
  assert.ok(calls.filter((c) => c.startsWith("select")).every((c) => c.includes("org_id")), "every read filters by org_id");
  const vec = tables.un_sop_chunks[0].embedding;
  assert.match(String(vec), /^\[-?[\d.e-]+,/, "pgvector text form");
});

test("a different organisation sees nothing of another's rows", async () => {
  const { client } = mockClient();
  const a = supabaseKbStore(client, ORG);
  await a.putQuestions("S", [{ id: "q1", question: "a question here", expect: { outside: true }, split: "tune" }]);
  assert.equal((await supabaseKbStore(client, "00000000-0000-4000-8000-000000000009").listQuestions("S")).length, 0);
  assert.equal((await a.listQuestions("S")).length, 1);
});

test("the SQL is a new file, creates the six tables, vector(768) and an append-only log, and no outside queue", () => {
  const sql = readFileSync("supabase/un-sop-kb.sql", "utf8");
  for (const t of ["un_sops", "un_sop_chunks", "un_kb_configs", "un_kb_questions", "un_kb_runs", "un_kb_log"]) assert.match(sql, new RegExp(`create table if not exists public\\.${t}\\b`));
  assert.match(sql, /embedding vector\(768\)/);
  assert.match(sql, /create extension if not exists vector/);
  assert.match(sql, /un_kb_log_no_update/);
  assert.doesNotMatch(sql, /outside_request|un_outside/i);
  assert.doesNotMatch(readFileSync("supabase/schema.sql", "utf8"), /un_kb_log|un_sop_chunks/, "schema.sql is untouched");
  assert.match(sql, /NOT APPLIED/);
});
