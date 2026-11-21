import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import * as A from "../src/lib/un/country-actions.ts";
import { fileDeps, memoryStore, noGov } from "../src/lib/un/country-deps.ts";
import { chunkWords, readStaged } from "../src/lib/un/country-build.ts";
import { countryStore, type CountryStore } from "../src/lib/un/country-store.ts";
import { COUNTRIES, diffRuns, replayCountry, scopeChunks, countryOf, appendCountry, verifyCountry } from "../src/lib/un/country.ts";
import type { SupabaseLike } from "../src/lib/un/kb-store-supabase.ts";
import { loadChunks, type Chunk } from "../src/lib/un/kb.ts";
import { parseVectors } from "../src/lib/un/vector.ts";
import { AR } from "../src/lib/un/i18n/dict.ts";

const corpus = loadChunks();
const SG_NEW = ["sg-mgf-2020", "sg-mgf-genai", "sg-pdpc-ai-recdec", "sg-pdpc-genai", "sg-nais-2", "sg-aiverify-framework", "sg-govtech-rai-playbook", "sg-pdpa-2012"];

test("Singapore sources: eight added as verbatim short excerpts with provenance; the earlier 398 chunks are untouched; every chunk has a vector", () => {
  const src = JSON.parse(readFileSync("kb/sources.json", "utf8")) as { id: string; url: string; issuer: string; date: string; source_sha256: string; jurisdiction: string; excerpts?: { text: string; where: string }[] }[];
  for (const id of SG_NEW) {
    const s = src.find((x) => x.id === id)!;
    assert.ok(s, id);
    assert.equal(s.jurisdiction, "Singapore");
    assert.match(s.url, /^https:\/\//);
    assert.match(s.source_sha256, /^[0-9a-f]{64}$/);
    assert.ok(s.issuer && s.date, id);
    assert.ok(s.excerpts!.length >= 5);
    for (const e of s.excerpts!) assert.ok(e.text.split(/\s+/).length <= 40 && e.where, `${id}: ${e.text}`);
    assert.equal(corpus.filter((c) => c.source_id === id).length, s.excerpts!.length);
  }
  assert.equal(corpus.filter((c) => c.jurisdiction === "Singapore").length, 77);
  // earlier chunk ids that recorded runs cite still exist, in the same place
  assert.equal(corpus[0].chunk_id, "uae-cabinet-agentic-50#0");
  assert.ok(corpus.some((c) => c.chunk_id === "sg-imda-agentic-mgf#6") && corpus.some((c) => c.chunk_id === "eu-ai-act-articles#5"));
  assert.ok(parseVectors(JSON.parse(readFileSync("kb/vectors.json", "utf8")), corpus), "kb/vectors.json must cover every chunk");
});

test("scopes: Singapore is Singapore plus international, the UAE is UAE and Dubai plus international, nothing else leaks in", () => {
  const sg = scopeChunks(corpus, countryOf("SG")!);
  const uae = scopeChunks(corpus, countryOf("UAE")!);
  assert.deepEqual([...new Set(sg.map((c) => c.jurisdiction))].sort(), ["Singapore", "international"]);
  assert.deepEqual([...new Set(uae.map((c) => c.jurisdiction))].sort(), ["Dubai", "UAE-federal", "international"]);
  assert.equal(COUNTRIES.find((c) => c.id === "EU")!.built, "on_demand");
});

test("the staged EU files are pre-fetched with provenance, and the chunker keeps about 256 words with overlap", () => {
  const files = readStaged("kb/stage/eu");
  assert.ok(files.length >= 7);
  for (const f of files) { assert.match(f.source_sha256, /^[0-9a-f]{64}$/); assert.match(f.url, /^https:\/\//); assert.equal(f.jurisdiction, "EU"); assert.ok(f.text.length > 500); }
  const words = Array.from({ length: 600 }, (_, i) => `w${i}`).join(" ");
  const c = chunkWords(words);
  assert.deepEqual(c.map((x) => x.split(" ").length), [256, 256, 148]);
  assert.equal(c[1].split(" ")[0], "w226");
});

const noEmbed = null;
const fakeEmbed = async (texts: string[]) => texts.map(() => Array.from({ length: 8 }, (_, i) => i / 8));
function mk(store: CountryStore, o: { embed?: typeof fakeEmbed | null } = {}) {
  const ucs = new Map<string, unknown>();
  const d: A.Deps = { ...fileDeps(), store, embed: o.embed === undefined ? noEmbed : o.embed, gov: noGov, useCases: { upsert: async (u) => { ucs.set(u.ext_id, u); return null; }, remove: async (e) => { ucs.delete(e); } } };
  return { d, ucs };
}

test("the process under the UAE and Singapore rule sets: different gates, sources and verdicts; deterministic; Singapore cites only Singapore and international sources", async () => {
  const { d } = mk(memoryStore());
  const s0 = (await A.loadState(d)).state;
  const uae = (await A.baselineRun(d, s0, "UAE"))!.run;
  const sg = (await A.baselineRun(d, s0, "SG"))!.run;
  assert.equal(uae.final, "GO_SUPERVISED");
  assert.equal(sg.final, "ESCALATE"); // hallucination_rate is a Singapore gate and the staged evidence has none: unknown, so escalate
  assert.deepEqual(uae.required.map((g) => g.id).sort(), ["ai_disclosure", "approved_infrastructure", "audit_log", "data_lawful", "human_final_approval"]);
  assert.deepEqual(sg.required.map((g) => g.id).sort(), ["audit_log", "data_lawful", "hallucination_rate", "human_final_approval"]);
  assert.equal(sg.required.find((g) => g.id === "hallucination_rate")!.status, "unknown");
  assert.equal(sg.steps.length, 5);
  const allowed = new Set(["Singapore", "international"]);
  assert.ok(sg.cited.length >= 3);
  assert.ok(sg.cited.filter((c) => c.from === "policy").every((c) => allowed.has(c.jurisdiction)), "a UAE, EU or US chunk leaked into the Singapore run");
  assert.ok(uae.cited.filter((c) => c.from === "policy").every((c) => c.jurisdiction !== "Singapore"));
  assert.ok(sg.cited.some((c) => c.source_id.startsWith("sg-pdpa") || c.source_id.startsWith("sg-mgf")), "the new Singapore sources are cited");
  // deterministic: same inputs, same head hash
  const again = (await A.baselineRun(d, s0, "SG"))!.run;
  assert.equal(again.head_hash, sg.head_hash);
  assert.notEqual(uae.head_hash, sg.head_hash);
  assert.ok(diffRuns(uae, sg).verdict.differs && diffRuns(uae, sg).gates.onlyA.includes("approved_infrastructure") && diffRuns(uae, sg).gates.onlyB.includes("hallucination_rate"));
});

async function fullFlow(store: CountryStore) {
  const { d, ucs } = mk(store, { embed: fakeEmbed });
  const sw = await A.switchCountry(d, "admin@x", "SG");
  assert.ok(sw.ok && sw.run.country === "SG" && sw.before === "UAE");
  const back = await A.switchCountry(d, "admin@x", "UAE");
  assert.ok(back.ok && back.matchesStored === true, "switching back must reproduce the stored UAE result exactly");
  assert.equal((await A.switchCountry(d, "admin@x", "EU")).ok, false, "an EU switch before the policy exists is refused");
  const pol = await A.addPolicy(d, "admin@x", "EU", () => {});
  assert.ok(pol.ok && pol.chunks > 20 && pol.vectors && pol.timings.map((t) => t.stage).join().includes("index (BM25)"));
  assert.ok(pol.run.cited.some((c) => c.source_id.startsWith("eu-ai-act-art")), "the live-built EU sources are cited");
  assert.equal((await A.addPolicy(d, "admin@x", "EU")).ok, false);
  assert.ok(await store.getBlob("vectors:EU"));
  const on = await A.onboardCompany(d, "admin@x", { sample: "sg-mbla", country: "SG" });
  assert.ok(on.ok);
  if (!on.ok) return;
  assert.ok(on.company.profiles.some((p) => p.name === "Compliance Officer"), "the extra approval step brings a new job profile");
  assert.ok(on.company.steps.length > 100);
  assert.ok(ucs.has(on.company.ext_id));
  assert.ok(on.run.cited.some((c) => c.from === "company_sop"), "the company SOP is cited for process facts");
  const st = (await A.loadState(d)).state;
  const co = await A.companyView(d, st, on.company.id);
  const ma = await A.companyView(d, st, "marsa");
  assert.ok(co && ma);
  const sop = (await import("../src/lib/un/country.ts")).diffSops(ma!.lines, co!.lines, 400);
  const added = sop.added.join("\n"), removed = sop.removed.join("\n");
  assert.match(added, /Compliance Officer countersigns/); // extra approval
  assert.match(added, /Kept for 5 years/); assert.match(removed, /Kept for 7 years/); // retention
  assert.match(added, /goods-and-services tax/); // fee check
  assert.match(added, /corporate profile extract \(D7\)/); // extra document
  assert.ok((await A.recordRun(d, "admin@x", "marsa", "SG")).ok && (await A.recordRun(d, "admin@x", on.company.id, "SG")).ok);
  const l = await A.loadState(d);
  assert.ok(l.verified.ok);
  assert.deepEqual(l.entries.map((e) => e.seq), l.entries.map((_, i) => i + 1));
  assert.ok(l.entries.length >= 11, "seq 10, 11, 12 must sort after 9");
  const res = await A.resetDemo(d, "admin@x");
  assert.ok(res.ok && res.removed.use_cases.length === 1);
  assert.equal(ucs.size, 0);
  assert.equal(await store.getBlob("vectors:EU"), null);
  assert.equal(await store.getBlob(`sop:${on.company.id}`), null);
  const after = await A.loadState(d);
  assert.deepEqual(Object.keys(after.state.companies), []);
  assert.deepEqual(Object.keys(after.state.policies), []);
  assert.equal(after.state.active.country, "UAE");
  assert.equal(after.state.resets, 1);
  assert.ok(after.verified.ok && after.entries.length === l.entries.length + 1, "reset appends; the log is never shortened");
  assert.equal((await A.switchCountry(d, "admin@x", "EU")).ok, false, "after a reset the EU scope has no index again");
  // rehearse again from the reset state
  assert.ok((await A.addPolicy(d, "admin@x", "EU")).ok);
}

test("whole flow on the in-memory store", async () => { await fullFlow(memoryStore()); });

test("whole flow on the offline database stand-in (the OFFLINE=1 path of the app)", async () => {
  process.env.OFFLINE = "1";
  process.env.OFFLINE_DB = path.join(mkdtempSync(path.join(tmpdir(), "country-")), "db.json");
  const { offlineClient, OFFLINE_ORG } = await import("../src/lib/supabase/offline.ts");
  await fullFlow(countryStore(offlineClient() as unknown as SupabaseLike, OFFLINE_ORG));
});

type Row = Record<string, unknown>;
/** A strict mock of the supabase-js query shape: only select/eq/insert/upsert/delete exist (anything else throws, as an unsupported call would),
 * the primary keys are enforced, timestamps come back in Postgres format and jsonb keys come back reordered. */
function strictClient() {
  const tables: Record<string, Row[]> = {};
  const pk: Record<string, string[]> = { un_country_log: ["org_id", "seq"], un_country_blobs: ["org_id", "key"] };
  const calls: string[] = [];
  const jsonb = (v: unknown): unknown => (Array.isArray(v) ? v.map(jsonb) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as object).sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([k, x]) => [k, jsonb(x)])) : v);
  const client = {
    from(table: string) {
      assert.ok(pk[table], `unknown table ${table}`);
      const rows = (tables[table] ??= []);
      let op = "select"; let payload: Row[] = []; let conflict: string[] = [];
      const filters: [string, unknown][] = [];
      const q = {
        select() { return q; },
        eq(c: string, v: unknown) { filters.push([c, v]); return q; },
        insert(r: Row | Row[]) { op = "insert"; payload = Array.isArray(r) ? r : [r]; return q; },
        upsert(r: Row, o: { onConflict: string }) { op = "upsert"; payload = [r]; conflict = o.onConflict.split(","); return q; },
        delete() { op = "delete"; return q; },
        then(ok: (v: { data: unknown; error: { message: string } | null }) => unknown) {
          calls.push(`${op} ${table}`);
          const match = (r: Row) => filters.every(([c, v]) => r[c] === v);
          let res: { data: unknown; error: { message: string } | null } = { data: null, error: null };
          if (op === "select") res = { data: rows.filter(match).map((r) => ({ ...r })), error: null };
          else if (op === "delete") { assert.ok(filters.some(([c]) => c === "org_id"), "a delete must be scoped to the organisation"); tables[table] = rows.filter((r) => !match(r)); }
          else for (const p of payload) {
            assert.ok(p.org_id, "every row carries org_id");
            const row: Row = { ...p, payload: jsonb(p.payload), body: jsonb(p.body), at: typeof p.at === "string" ? new Date(p.at).toISOString().replace("Z", "+00:00") : p.at };
            if (table === "un_country_log") assert.equal(typeof p.seq, "number");
            const hit = rows.find((r) => pk[table].every((k) => r[k] === p[k]));
            if (hit && op === "insert") { res = { data: null, error: { message: "duplicate key value violates unique constraint" } }; break; }
            if (hit) Object.assign(hit, row); else rows.push(row);
          }
          void conflict;
          return Promise.resolve(res).then(ok);
        },
      };
      return q;
    },
  };
  return { client: client as unknown as SupabaseLike, tables, calls };
}

test("whole flow on the Supabase path (strict mock: primary keys, Postgres timestamps, reordered jsonb, org-scoped deletes)", async () => {
  const m = strictClient();
  await fullFlow(countryStore(m.client, "org-1"));
  assert.ok(m.calls.every((c) => /^(select|insert|upsert|delete) un_country_(log|blobs)$/.test(c)));
  assert.ok(m.calls.includes("delete un_country_blobs") && !m.calls.includes("delete un_country_log"), "the log is never deleted from");
});

test("the store refuses a write that does not continue the stored log (a second admin wrote first)", async () => {
  const m = strictClient();
  const s = countryStore(m.client, "org-1");
  const e1 = appendCountry(null, "reset", "a", {}, "2026-11-21T10:00:00.000Z");
  const e2 = appendCountry(e1, "reset", "a", {}, "2026-11-21T10:00:01.000Z");
  await s.append([e1]);
  await assert.rejects(s.append([e1]), /append-only/);
  await assert.rejects(s.append([appendCountry(null, "reset", "b", {}, "2026-11-21T10:00:02.000Z")]), /append-only/);
  await s.append([e2]);
  assert.ok(verifyCountry(await s.log()).ok);
  // a different organisation sees nothing
  assert.deepEqual(await countryStore(m.client, "org-2").log(), []);
});

test("a tampered log entry is detected and refuses further writes", async () => {
  const store = memoryStore();
  const { d } = mk(store);
  assert.ok((await A.switchCountry(d, "a", "SG")).ok);
  const log = await store.log();
  (log[1].payload as { to: string }).to = "UAE";
  assert.equal(verifyCountry(log).ok, false);
  const r = await A.switchCountry(d, "a", "UAE");
  assert.equal(r.ok, false);
  assert.equal(replayCountry([]).active.country, "UAE");
});

test("the route is admin-only and every dictionary key the screen uses has a draft Arabic string", () => {
  const route = readFileSync("src/app/api/admin/un/country/route.ts", "utf8");
  assert.match(route, /requireAdmin\(\)/);
  assert.ok(route.indexOf("requireAdmin") < route.indexOf("appCountryDeps"));
  assert.doesNotMatch(route, /export async function (GET|PUT|DELETE|PATCH)/);
  assert.ok(existsSync("supabase/un-country.sql") && /create table if not exists public\.un_country_log/.test(readFileSync("supabase/un-country.sql", "utf8")));
  const ui = readFileSync("src/app/admin/federal/country/page.tsx", "utf8") + readFileSync("src/app/admin/federal/country/CountryPanel.tsx", "utf8");
  const keys = [...ui.matchAll(/\bk="(cn\.[\w.]+)"|"(cn\.[\w.]+)"/g)].map((m) => m[1] ?? m[2]);
  assert.ok(keys.length > 15);
  for (const k of new Set(keys)) assert.ok(AR[k], `no Arabic for ${k}`);
});

test("a Chunk typed SOP keeps the company out of the corpus: a run's SOP chunks are separate from the policy scope", async () => {
  const { d } = mk(memoryStore());
  const r = await A.runFor(d, (await A.loadState(d)).state, "marsa", "SG");
  assert.ok("corpus" in r && r.corpus.sop_chunks > 50 && r.corpus.policy_sources >= 15);
  const _c: Chunk[] = corpus; void _c;
});

test("reset at the starting state is a no-op (no log entry); a repeated or concurrent reset logs once", async () => {
  const store = memoryStore();
  const { d } = mk(store);
  const r0 = await A.resetDemo(d, "a");
  assert.ok(r0.ok && r0.noop === true);
  assert.equal((await A.loadState(d)).entries.length, 0, "a no-op reset appends nothing");
  assert.ok((await A.switchCountry(d, "a", "SG")).ok);
  const n = (await A.loadState(d)).entries.length;
  const [x, y, z] = await Promise.all([A.resetDemo(d, "a", "org"), A.resetDemo(d, "a", "org"), A.resetDemo(d, "a", "org")]);
  assert.ok(x.ok && y.ok && z.ok);
  assert.equal((await A.loadState(d)).entries.length, n + 1, "three simultaneous requests log one reset");
  const again = await A.resetDemo(d, "a");
  assert.ok(again.ok && again.noop === true);
  assert.equal((await A.loadState(d)).entries.length, n + 1, "a later request is a no-op");
});
