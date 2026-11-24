import assert from "node:assert/strict";
import test from "node:test";
import { llmReflector, parseReflection, reflectPrompt, REFLECT_SYSTEM, SYSTEM, type ChatFn } from "../src/lib/un/react-llm.ts";
import { reactAnswer, verifyReflection, type Reflector } from "../src/lib/un/react-sop.ts";
import { searchSop } from "../src/lib/un/sop-kb.ts";

const SOP = "SOP-LIC-014";
const retrieve = async (q: string, kind?: string) => (await searchSop(SOP, q, { k: 5, kind })).hits;
const P = [{ chunk_id: "SOP-LIC-014#D1", text: "**Required documents:** a valid insurance certificate and the *trade licence* itself.\nSecond line." }];

test("verifyReflection: the quote must be a real sentence of a cited passage (case and markdown aside)", () => {
  assert.deepEqual(verifyReflection({ answers: true, quote: "a valid insurance certificate and the trade licence itself", why: "" }, P), { ok: true, chunk_id: "SOP-LIC-014#D1", quote: "a valid insurance certificate and the trade licence itself" });
  assert.equal(verifyReflection({ answers: true, quote: "A VALID INSURANCE CERTIFICATE", why: "" }, P).ok, true);
  const no = (r: Parameters<typeof verifyReflection>[0]) => verifyReflection(r, P);
  assert.equal(no(null).ok, false);
  assert.equal(no({ answers: false, quote: "a valid insurance certificate", why: "does not say" }).ok, false);
  assert.match(String((no({ answers: false, quote: "", why: "does not say" }) as { why: string }).why), /does not say/);
  assert.match(String((no({ answers: true, quote: "short", why: "" }) as { why: string }).why), /no quote/);
  assert.match(String((no({ answers: true, quote: "licence", why: "" }) as { why: string }).why), /no quote/);
  assert.match(String((no({ answers: true, quote: "a fee of 5000 is charged for renewal in another city", why: "" }) as { why: string }).why), /not text of any cited passage/);
  // a table row, and a quote that skips text with "..." as long as each fragment is exact and in order
  const T = [{ chunk_id: "SOP-LIC-014#S6", text: "| Group | Base fee | Late fee |\n|---|---|---|\n| Food and hospitality | 2,000 | 10% of base |" }];
  assert.equal(verifyReflection({ answers: true, quote: "Food and hospitality | 2,000 | 10% of base", why: "" }, T).ok, true);
  assert.equal(verifyReflection({ answers: true, quote: "10% of base", why: "" }, T).ok, true);
  assert.equal(verifyReflection({ answers: true, quote: "Food and hospitality ... 10% of base", why: "" }, T).ok, true);
  assert.equal(verifyReflection({ answers: true, quote: "10% of base ... Food and hospitality", why: "" }, T).ok, false, "fragments must be in order");
  assert.equal(verifyReflection({ answers: true, quote: "Food and hospitality ... 12% of base", why: "" }, T).ok, false, "every fragment must be exact");
  // a table header and a cell of its column, joined with "|"; two stray words are not a quote
  const T2 = [{ chunk_id: "SOP-LIC-014#S6", text: "| Activity group | Base renewal fee | Late fee (days 1 to 30 after expiry) |\n|---|---|---|\n| Retail and trading | 1,200 | 10% of base |" }];
  assert.equal(verifyReflection({ answers: true, quote: "Late fee (days 1 to 30 after expiry) | 10% of base", why: "" }, T2).ok, true);
  assert.equal(verifyReflection({ answers: true, quote: "Group | Fee", why: "" }, T2).ok, false, "no substantial fragment");
  assert.equal(verifyReflection({ answers: true, quote: "Retail and trading | 1,200 | 99% of base", why: "" }, T2).ok, false, "every fragment must be exact");
});

test("reflection: a finish whose reflection says no is refused, the cited passages are dropped, and the run ends outside the SOP", async () => {
  let asked = 0;
  const reflect: Reflector = async () => { asked++; return { answers: false, quote: "", why: "the passages only describe the procedure" }; };
  const r = await reactAnswer(SOP, "insurance certificate minimum cover", { retrieve, reflect, requestOutside: () => "queued" });
  assert.equal(r.status, "outside_kb");
  assert.ok(asked >= 1);
  assert.ok(r.steps.some((s) => /^rejected by reflection: the passages only describe the procedure/.test(s.observation)));
  assert.deepEqual(r.citations, []);
});

test("reflection: a verbatim quote lets the finish stand, the citation narrows to the quoted passage, and the quote is the answer", async () => {
  const reflect: Reflector = async (_q, passages) => ({ answers: true, quote: passages[0].text.split("\n")[0].trim(), why: "states it" });
  const r = await reactAnswer(SOP, "insurance certificate minimum cover", { retrieve, reflect });
  assert.equal(r.status, "answered");
  assert.equal(r.citations.length, 1);
  assert.equal(r.answer.length, 1);
  assert.equal(r.answer[0].chunk_id, r.citations[0]);
  assert.ok(r.steps.some((s) => /reflection quoted the answer/.test(s.observation)));
});

test("reflection: a quote that is not in the passage, or a reflector that fails, refuses the finish (it never passes by saying yes)", async () => {
  const fake: Reflector = async () => ({ answers: true, quote: "Renewal in another city is allowed with a letter of consent.", why: "yes" });
  assert.equal((await reactAnswer(SOP, "insurance certificate minimum cover", { retrieve, reflect: fake, requestOutside: () => "queued" })).status, "outside_kb");
  const boom: Reflector = async () => { throw new Error("model down"); };
  const r = await reactAnswer(SOP, "insurance certificate minimum cover", { retrieve, reflect: boom, requestOutside: () => "queued" });
  assert.equal(r.status, "outside_kb");
  assert.ok(r.steps.some((s) => /reflection step failed: model down/.test(s.observation)));
});

test("without a reflector the loop behaves as before", async () => {
  const r = await reactAnswer(SOP, "insurance certificate minimum cover", { retrieve });
  assert.equal(r.status, "answered");
});

test("parseReflection: an unreadable reply is a no, never a yes", () => {
  assert.deepEqual(parseReflection('{"answers": true, "quote": "q", "why": "w"}'), { answers: true, quote: "q", why: "w" });
  assert.equal(parseReflection('{"answers": "yes"}').answers, false);
  assert.equal(parseReflection("I think so").answers, false);
});

test("the reflector counts its calls, its refusals and its errors, and uses REFLECT_LLM_MODEL when set", async () => {
  let n = 0;
  const chat: ChatFn = async () => { n++; if (n === 3) throw new Error("boom"); return n === 1 ? '{"answers": true, "quote": "x", "why": ""}' : '{"answers": false, "quote": "", "why": "no"}'; };
  const r = llmReflector({ chat, model: "m" });
  await r.reflect("q", P);
  await r.reflect("q", P);
  await assert.rejects(r.reflect("q", P), /boom/);
  assert.deepEqual({ calls: r.usage.calls, said_no: r.usage.said_no, errors: r.usage.errors }, { calls: 3, said_no: 1, errors: 1 });
  const saved = process.env.REFLECT_LLM_MODEL;
  process.env.REFLECT_LLM_MODEL = "stronger-model";
  try { assert.equal(llmReflector({ chat }).model, "stronger-model"); } finally { if (saved === undefined) delete process.env.REFLECT_LLM_MODEL; else process.env.REFLECT_LLM_MODEL = saved; }
});

test("the prompts carry the decision procedure: conditions, shared words prove nothing, outside cases, and the quote", () => {
  assert.match(SYSTEM, /every specific condition/);
  assert.match(SYSTEM, /prove nothing/);
  assert.match(SYSTEM, /another city/);
  assert.match(SYSTEM, /word for word/);
  assert.match(REFLECT_SYSTEM, /a row or a cell of a table/);
  assert.match(REFLECT_SYSTEM, /word for word/);
  const p = reflectPrompt("can I renew in another city", P);
  assert.match(p, /Question: can I renew in another city/);
  assert.match(p, /\[SOP-LIC-014#D1\]/);
});
