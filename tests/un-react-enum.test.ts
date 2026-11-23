import assert from "node:assert/strict";
import test from "node:test";
import { llmReasoner, type ChatFn } from "../src/lib/un/react-llm.ts";
import { commonTerms, enumerationKind, groundedHits, inScope, itemChunks, reactAnswer, type Reflector } from "../src/lib/un/react-sop.ts";
import { loadSop, searchSop } from "../src/lib/un/sop-kb.ts";

const SOP = "SOP-LIC-014";
const retrieve = async (q: string, kind?: string) => (await searchSop(SOP, q, { k: 5, kind })).hits;
const ids = (xs: string[]) => xs.map((c) => c.split("#")[1]);
const D = ["D1", "D2", "D3", "D4", "D5", "D6"];

test("enumerationKind: a which/what/list question about documents asks for the whole list; other questions do not", () => {
  assert.equal(enumerationKind("which documents are required for a trade licence renewal"), "required-documents");
  assert.equal(enumerationKind("what documents do I need to renew my licence"), "required-documents");
  assert.equal(enumerationKind("list the documents needed for renewal"), "required-documents");
  assert.equal(enumerationKind("is the insurance certificate a document I must send"), null);
  assert.equal(enumerationKind("insurance certificate minimum cover"), null);
  assert.equal(enumerationKind("what is the late fee percentage"), null);
});

test("itemChunks: the passages that are the numbered items of a kind, not its submission and validation rules", () => {
  assert.deepEqual(ids(itemChunks(loadSop(SOP).chunks, "required-documents").map((c) => c.chunk_id)), D);
  assert.deepEqual(itemChunks(loadSop(SOP).chunks, "fees"), []);
});

test("inScope: a bare list question, or one with a subject term of the SOP, is about this SOP; other subjects are not", () => {
  const common = commonTerms(loadSop(SOP).chunks);
  assert.equal(inScope("which documents are required", common), true);
  assert.equal(inScope("which documents are required for a trade licence renewal", common), true);
  assert.equal(inScope("which documents are required to open a bank account", common), false);
  assert.equal(inScope("which documents are required to get a passport", common), false);
});

test("a list question is answered with every document of the SOP, each with its own quote", async () => {
  for (const q of ["which documents are required for a trade licence renewal", "what documents do I need to renew my licence", "list the documents needed for renewal", "which documents are required"]) {
    const r = await reactAnswer(SOP, q, { retrieve });
    assert.equal(r.status, "answered", q);
    assert.deepEqual(ids(r.citations), D, q);
    assert.equal(r.answer.length, 6, q);
    assert.ok(r.answer.every((a) => a.quote.length > 10), q);
    assert.ok(r.steps.some((s) => /every passage of this kind is gathered: D1, D2/.test(s.observation)), q);
  }
});

test("a list question about something else, or with a condition the SOP never mentions, is not answered with the list", async () => {
  for (const q of ["which documents are required to get a passport", "which documents are required to renew a licence in another city", "which documents does the tax authority require for a licence", "what documents does my business need for a visa"]) {
    const r = await reactAnswer(SOP, q, { retrieve, requestOutside: () => "queued" });
    assert.equal(r.status, "outside_kb", q);
  }
  const bank = await reactAnswer(SOP, "which documents are required to open a bank account", { retrieve, requestOutside: () => "queued" });
  assert.ok(!ids(bank.citations).includes("D1"), "not the renewal list");
});

test("a model that cites one document is given the whole list; and a reflection that quotes any of them keeps the whole list", async () => {
  const reply = (thought: string, action: object) => JSON.stringify({ thought, action });
  const script = [reply("search", { tool: "search_sop", query: "which documents are required for a trade licence renewal" }), reply("done", { tool: "finish", citations: ["SOP-LIC-014#D2"] })];
  const stub = (): ChatFn => { let i = 0; return async () => script[Math.min(i++, script.length - 1)]; };
  const q = "which documents are required for a trade licence renewal";
  const plain = await reactAnswer(SOP, q, { retrieve, reasoner: llmReasoner({ chat: stub() }).reasoner });
  assert.deepEqual(ids(plain.citations), D);
  const reflect: Reflector = async (_q, passages) => ({ answers: true, quote: passages[1].text.split("\n").map((l) => l.trim()).sort((a, b) => b.length - a.length)[0], why: "lists it" });
  const reflected = await reactAnswer(SOP, q, { retrieve, reasoner: llmReasoner({ chat: stub() }).reasoner, reflect });
  assert.equal(reflected.status, "answered");
  assert.deepEqual(ids(reflected.citations), D);
  const no: Reflector = async () => ({ answers: false, quote: "", why: "does not list them" });
  const refused = await reactAnswer(SOP, q, { retrieve, reasoner: llmReasoner({ chat: stub() }).reasoner, reflect: no, requestOutside: () => "queued" });
  assert.equal(refused.status, "outside_kb");
});

test("the model is shown every gathered passage of a list, told to finish, and the reflector is told it is a list", async () => {
  const { promptFor, reflectPrompt } = await import("../src/lib/un/react-llm.ts");
  const chunks = loadSop(SOP).chunks;
  const items = itemChunks(chunks, "required-documents");
  const s = { question: "which documents are required for a trade licence renewal", steps: [], retrieved: new Map(items.map((c) => [c.chunk_id, c] as const)), supported: new Map(items.map((c) => [c.chunk_id, "q"] as const)), enumerated: items.map((c) => c.chunk_id) };
  const p = promptFor(s);
  assert.match(p, /asks for a LIST/);
  for (const id of D) assert.ok(p.includes(`[SOP-LIC-014#${id}]`), id);
  assert.doesNotMatch(promptFor({ ...s, enumerated: undefined }), /asks for a LIST/);
  assert.match(reflectPrompt("q", [{ chunk_id: "SOP-LIC-014#D1", text: "t" }], { list: true }), /ONE item of it/);
  assert.doesNotMatch(reflectPrompt("q", [{ chunk_id: "SOP-LIC-014#D1", text: "t" }]), /LIST/);
});

test("a rejected finish keeps the gathered list, so the reasoner can try again; a null kind means no kind", async () => {
  const { checkAction } = await import("../src/lib/un/react-sop.ts");
  assert.deepEqual(checkAction({ tool: "search_sop", query: "x", kind: null }, new Set(["fees"])), { ok: true, action: { tool: "search_sop", query: "x" } });
  assert.equal(checkAction({ tool: "search_sop", query: "x", kind: "nope" }, new Set(["fees"])).ok, false);
  let reflections = 0;
  const reflect: Reflector = async (_q, passages) => { reflections++; return reflections === 1 ? { answers: false, quote: "", why: "try again" } : { answers: true, quote: passages[0].text.split("\n").map((l) => l.trim()).sort((a, b) => b.length - a.length)[0], why: "ok" }; };
  const reply = (action: object) => JSON.stringify({ thought: "t", action });
  const script = [reply({ tool: "search_sop", query: "which documents are required for a trade licence renewal" }), reply({ tool: "finish", citations: ["SOP-LIC-014#D1"] }), reply({ tool: "finish", citations: ["SOP-LIC-014#D1"] })];
  let i = 0;
  const chat: ChatFn = async () => script[Math.min(i++, script.length - 1)];
  const r = await reactAnswer(SOP, "which documents are required for a trade licence renewal", { retrieve, reasoner: llmReasoner({ chat }).reasoner, reflect, requestOutside: () => "queued" });
  assert.equal(reflections, 2);
  assert.equal(r.status, "answered");
  assert.deepEqual(ids(r.citations), D);
});

const hit = (id: string, body: string) => ({ score: 1, chunk: { chunk_id: id, source_id: "S", text: `SOP v1 | heading\n${body}`, sha256: "x", title: "t", url: "", issuer: "", jurisdiction: "", instrument_type: "", binding: true, date: null, topics: [], matrix_quadrants: [] } }) as unknown as Parameters<typeof groundedHits>[0][number];

test("support needs one sentence that shares enough of the question AND a rare word of it: two sentences cannot split the two conditions", () => {
  // 'documents' and 'required' are common in this SOP; 'open', 'bank' and 'account' are rare. In the first passage the common words
  // sit in one sentence and the rare word 'open' in another: the passage does not answer a question about a bank account.
  const common = new Set(["documents", "required", "licence", "renew"]);
  const q = "which documents are required to open a bank account";
  const split = hit("S#A", "Tell the applicant which documents are required and the next step. Open the case file when the request arrives.");
  const same = hit("S#B", "Ask the applicant which documents are required to open a bank account. Then record it.");
  assert.deepEqual(groundedHits([split], q, common).map((x) => x.hit.chunk.chunk_id), []);
  assert.deepEqual(groundedHits([same], q, common).map((x) => x.hit.chunk.chunk_id), ["S#B"]);
});

test("a question about a bank account, a passport or another city is not answered from a passage that merely says documents are required", async () => {
  for (const q of ["which documents are required to open a bank account", "which documents are required to get a passport", "can I renew my trade licence in another city instead"]) {
    const r = await reactAnswer(SOP, q, { retrieve, requestOutside: () => "queued" });
    assert.equal(r.status, "outside_kb", q);
  }
});
