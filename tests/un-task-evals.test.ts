import assert from "node:assert/strict";
import test from "node:test";
import { openAgent } from "../src/lib/un/analyst-agent.ts";
import { inMemoryStore, replayCase } from "../src/lib/un/case-memory.ts";
import { DOC_DIR, DOCS, NO_REGISTRY, RECORDS, TODAY } from "../src/lib/un/fixtures-uc02.ts";
import { imageSha, tesseractOcr, closeOcr } from "../src/lib/un/doc-ocr.ts";
import { searchChunks, type Hit } from "../src/lib/un/kb.ts";
import { loadSop, searchSop } from "../src/lib/un/sop-kb.ts";
import { CASES, loadOcrCache, perTask, readImage, recordedOcr, runAll, runCase, SOP_ID } from "../src/lib/un/task-evals.ts";

const bm25 = async (q: string, kind?: string) => (await searchSop(SOP_ID, q, { k: 5, kind })).hits;
const env = { retrieve: bm25, ocr: recordedOcr() };

test("per-task evals: every case passes on the real skill, ReAct retrieval, OCR output and case memory", async () => {
  const outcomes = await runAll(env);
  const bad = outcomes.filter((o) => o.verdict !== "correct").map((o) => `${o.id} [${o.verdict}] ${o.failures.join("; ")}`);
  assert.deepEqual(bad, []);
});

test("per-task evals: each automated task has several cases, and boundaries and adversarial inputs are held out", () => {
  for (const t of ["T04", "T05", "T06", "T07", "T08", "T09", "T10", "T11", "T12", "T13"]) assert.ok(CASES.filter((c) => c.task === t).length >= 2, t);
  assert.ok(CASES.filter((c) => c.split === "holdout").length >= 15);
  assert.equal(new Set(CASES.map((c) => c.id)).size, CASES.length);
  assert.ok(perTask([]).length === 0);
});

test("recorded OCR covers every synthetic image, so a changed image cannot silently reuse old output", () => {
  const cache = loadOcrCache();
  for (const [k, d] of Object.entries(DOCS)) assert.ok(cache[imageSha(readImage(k))], `${d.file} has no recorded OCR output: run scripts/make_synthetic_docs.ts --ocr`);
});

test("the evals can fail: if the SOP lowers the lease requirement, the short-lease cases flip", async () => {
  const chunks = loadSop(SOP_ID).chunks.map((c) => ({ ...c, text: c.text.replaceAll("12 months", "6 months") }));
  const mutated = async (q: string): Promise<Hit[]> => searchChunks(chunks, q, { k: 5 });
  const outcomes = await runAll({ retrieve: mutated, ocr: recordedOcr() }, CASES.filter((c) => ["t06-short", "t06-good", "t09-two-issues", "t05-good"].includes(c.id)));
  const by = Object.fromEntries(outcomes.map((o) => [o.id, o.verdict]));
  assert.equal(by["t06-short"], "wrong"); // the agent now accepts an 8-month lease, as the edited SOP says; the eval notices
  assert.equal(by["t09-two-issues"], "wrong");
  assert.equal(by["t06-good"], "correct");
  assert.equal(by["t05-good"], "correct");
});

test("the grader marks an email to a non-registered address as unsafe", async () => {
  const c = CASES.find((x) => x.id === "t10-email")!;
  const r = await runCase(c, env);
  assert.equal(r.verdict, "correct");
  const forged = { ...r.result, output: { ...r.result.output, email: { ...(r.result.output.email as object), to: "someone@elsewhere.example" } } };
  assert.ok(c.check(forged, undefined as never).some((f) => f.startsWith("UNSAFE")));
});

test("case memory persists across sessions, hands over between agents, and breaks the chain if edited", async () => {
  const store = inMemoryStore();
  const tools = { licenceRecord: () => RECORDS.noor, registry: () => NO_REGISTRY, payments: () => [], ocr: env.ocr, retrieve: bm25 };
  const open = (p: string) => openAgent({ sopId: SOP_ID, profile: p, caseId: "CASE-mem", today: TODAY, tools, store, actorClock: () => `${TODAY}T09:00:00.000Z` });
  const a = await open("Document Verification Analyst");
  await a.openCase({ licence_number: RECORDS.noor.licence_number, declared_activity_code: "4711" });
  for (const k of ["noor-d1", "noor-d2", "noor-d3", "noor-d4"]) assert.equal((await a.receiveDocument(readImage(k))).stored, true);
  for (const t of ["T04", "T05", "T06", "T07", "T08", "T09"]) await a.run(t);
  const b = await open("Fee and Payment Officer"); // a different agent, a later session: only memory links them
  assert.equal(b.state().status, "complete");
  assert.equal(Object.keys(b.state().documents).length, 4);
  assert.equal((await b.run("T11")).output.total, 1200);
  assert.equal(b.state().chain.ok, true);
  const entries = await store.load("CASE-mem");
  const edited = entries.map((e, i) => (i === 3 ? { ...e, payload: { ...e.payload, fields: { tampered: true } } } : e));
  assert.equal(replayCase("CASE-mem", edited).chain.ok, false);
  // control 4: the image itself is never stored, only its hash and the fields read
  assert.ok(!JSON.stringify(entries).includes("PNG"));
  assert.ok(entries.some((e) => e.kind === "document_received" && typeof e.payload.sha256 === "string"));
});

test("an agent cannot be opened for an SOP that is not vectorised, or for a profile the SOP does not have", async () => {
  const tools = { licenceRecord: () => null, registry: () => NO_REGISTRY, payments: () => [], ocr: env.ocr, retrieve: bm25 };
  await assert.rejects(openAgent({ sopId: "SOP-NOPE", profile: "Document Verification Analyst", caseId: "x", today: TODAY, tools, store: inMemoryStore() }), /cannot be used by an automated agent/);
  await assert.rejects(openAgent({ sopId: SOP_ID, profile: "Chief Wizard", caseId: "x", today: TODAY, tools, store: inMemoryStore() }), /no job profile/);
});

test("live OCR agrees with the recorded OCR (set OCR_LIVE=1; needs network the first time)", { skip: process.env.OCR_LIVE !== "1" }, async () => {
  const cache = loadOcrCache();
  for (const k of Object.keys(DOCS)) {
    const img = readImage(k);
    const live = await tesseractOcr(img);
    assert.equal(live.text.trim(), cache[imageSha(img)].text.trim(), `${DOC_DIR}/${DOCS[k].file} reads differently live`);
  }
  await closeOcr();
});
