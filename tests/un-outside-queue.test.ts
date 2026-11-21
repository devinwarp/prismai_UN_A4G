import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import test from "node:test";
import { openAgent } from "../src/lib/un/analyst-agent.ts";
import { inMemoryStore, replayCase } from "../src/lib/un/case-memory.ts";
import { NO_REGISTRY, RECORDS, TODAY } from "../src/lib/un/fixtures-uc02.ts";
import { answerOutside, listOutside, queueingRequestOutside } from "../src/lib/un/outside-queue.ts";
import { searchSop } from "../src/lib/un/sop-kb.ts";
import { recordedOcr } from "../src/lib/un/task-evals.ts";

// the offline store is a JSON file; point it at a scratch file for this test
process.env.OFFLINE_DB = ".data/test-outside-queue.json";
const { offlineClient, OFFLINE_ORG } = await import("../src/lib/supabase/offline.ts");
test.after(() => { if (existsSync(".data/test-outside-queue.json")) rmSync(".data/test-outside-queue.json"); });

const SOP = "SOP-LIC-014";
let retrievals = 0;
const retrieve = async (q: string, kind?: string) => { retrievals++; return (await searchSop(SOP, q, { k: 5, kind })).hits; };
const db = offlineClient();
const store = inMemoryStore();
const open = (requestOutside?: (r: never) => Promise<string>) => openAgent({
  sopId: SOP, profile: "Document Verification Analyst", caseId: "CASE-queue", today: TODAY, store, actorClock: () => `${TODAY}T09:00:00.000Z`,
  tools: { licenceRecord: () => RECORDS.noor, registry: () => NO_REGISTRY, payments: () => [], ocr: recordedOcr(), retrieve, requestOutside: requestOutside as never },
});
const Q = "what is the corporate tax rate for my company";

test("outside queue: the agent's required call lands in the queue; a viewer cannot answer; an admin can", async () => {
  const a = await open(queueingRequestOutside(db, OFFLINE_ORG, { caseId: "CASE-queue", sopId: SOP, profile: "Document Verification Analyst" }) as never);
  await a.openCase({ licence_number: RECORDS.noor.licence_number, declared_activity_code: "4711" });
  const r = await a.ask(Q);
  assert.equal(r.status, "outside_kb");
  let rows = await listOutside(db, OFFLINE_ORG);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "open");
  assert.equal(rows[0].question, Q);
  assert.ok(rows[0].tried.length >= 2);
  // asking again while it is open does not queue a second copy
  await a.ask(Q);
  assert.equal((await listOutside(db, OFFLINE_ORG)).length, 1);

  const id = rows[0].id;
  for (const role of ["viewer", null, "member"]) {
    const denied = await answerOutside(db, OFFLINE_ORG, id, { role }, "20%", store);
    assert.equal(denied.ok, false);
  }
  assert.equal((await listOutside(db, OFFLINE_ORG))[0].status, "open");
  assert.equal((await answerOutside(db, OFFLINE_ORG, id, { role: "admin" }, "   ", store)).ok, false);
  assert.equal((await answerOutside(db, OFFLINE_ORG, id, { role: "admin" }, "x".repeat(2001), store)).ok, false);

  const ok = await answerOutside(db, OFFLINE_ORG, id, { role: "admin", userId: "u-1" }, "The tax rate is not set by this procedure; ask the Federal Tax Authority.", store, () => `${TODAY}T10:00:00.000Z`);
  assert.equal(ok.ok, true);
  rows = await listOutside(db, OFFLINE_ORG);
  assert.equal(rows[0].status, "answered");
  assert.equal(rows[0].answered_role, "admin");
  assert.equal(rows[0].memory_hash, (ok as { hash: string }).hash);
  assert.equal((await answerOutside(db, OFFLINE_ORG, id, { role: "admin" }, "again", store)).ok, false, "an answered request cannot be answered twice");
});

test("outside queue: the answer is in the hash-chained case memory with the answerer's role, and the chain breaks if it is edited", async () => {
  const entries = await store.load("CASE-queue");
  const e = entries.find((x) => x.kind === "outside_answer")!;
  assert.equal(e.actor, "person:admin");
  assert.equal(e.payload.role, "admin");
  const s = replayCase("CASE-queue", entries);
  assert.equal(s.chain.ok, true);
  assert.equal(s.outside[0].answered?.role, "admin");
  const tampered = entries.map((x) => (x.kind === "outside_answer" ? { ...x, payload: { ...x.payload, answer: "the rate is 0%" } } : x));
  assert.equal(replayCase("CASE-queue", tampered).chain.ok, false);
});

test("outside queue: a new session resumes from memory: the answer is returned, nothing is searched or asked again", async () => {
  const a = await open(); // a later session; only memory links it to the first
  const before = retrievals;
  const r = await a.ask(Q);
  assert.equal(r.status, "answered_by_person");
  assert.equal(r.person_answer?.role, "admin");
  assert.match(r.person_answer!.answer, /Federal Tax Authority/);
  assert.equal(retrievals, before, "no retrieval happened");
  assert.deepEqual(r.calls, []);
  assert.equal((await listOutside(db, OFFLINE_ORG)).length, 1, "no new request was queued");
});

test("outside queue: migration is a new file and leaves schema.sql alone", async () => {
  const { readFileSync } = await import("node:fs");
  const sql = readFileSync("supabase/un-outside-queue.sql", "utf8");
  assert.match(sql, /create table if not exists public\.un_outside_requests/);
  assert.match(sql, /outside_answer/);
  assert.ok(!/un_outside_requests/.test(readFileSync("supabase/schema.sql", "utf8")));
});
