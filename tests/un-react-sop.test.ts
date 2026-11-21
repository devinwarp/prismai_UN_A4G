import assert from "node:assert/strict";
import test from "node:test";
import { reactAnswer, rewrite, type Reasoner } from "../src/lib/un/react-sop.ts";
import { searchSop } from "../src/lib/un/sop-kb.ts";

const SOP = "SOP-LIC-014";
// offline retriever (BM25, no model); the loop's guarantees do not depend on which retriever runs
const retrieve = async (q: string, kind?: string) => (await searchSop(SOP, q, { k: 5, kind })).hits;

test("ReAct: a question the SOP answers is answered in one search, with a checked citation and a verbatim quote", async () => {
  const r = await reactAnswer(SOP, "insurance certificate minimum cover", { retrieve });
  assert.equal(r.status, "answered");
  assert.ok(r.citations.includes("SOP-LIC-014#D4"));
  assert.equal(r.steps.filter((s) => s.action.tool === "search_sop").length, 1);
  assert.ok(r.answer.every((a) => a.quote.length > 0));
});

test("ReAct: a paraphrase that misses on the first search is rewritten with SOP terms and then answered", async () => {
  const r = await reactAnswer(SOP, "which papers must a business owner hand in to extend its commercial permit", { retrieve });
  const searches = r.steps.filter((s) => s.action.tool === "search_sop");
  assert.equal(r.status, "answered");
  assert.ok(searches.length >= 1);
  assert.ok(r.citations.some((c) => /#(D\d|S10|Q1|T03|T05)$/.test(c)), r.citations.join());
});

test("ReAct: information that is not in the SOP ends in the required outside-information call, with no citations", async () => {
  const calls: string[] = [];
  const r = await reactAnswer(SOP, "what is the corporate tax rate for my company", {
    retrieve,
    requestOutside: (q) => { calls.push(q.question); return "queued for a person"; },
  });
  assert.equal(r.status, "outside_kb");
  assert.deepEqual(r.citations, []);
  assert.equal(calls.length, 1);
  assert.ok(r.outside!.tried.length >= 2, "it searched and rewrote before giving up");
  assert.equal(r.steps[r.steps.length - 1].action.tool, "request_outside_information");
});

test("ReAct: a finish with a citation nobody retrieved is turned into the outside-information call", async () => {
  const liar: Reasoner = () => ({ thought: "I know this.", action: { tool: "finish", citations: ["SOP-LIC-014#D4"] } });
  const r = await reactAnswer(SOP, "anything", { retrieve, reasoner: liar });
  assert.equal(r.status, "outside_kb");
  assert.match(r.steps[0].observation, /rejected/);
});

test("ReAct: a reasoner that never finishes is stopped at the step limit with the outside call", async () => {
  let n = 0;
  const loop: Reasoner = () => ({ thought: "again", action: { tool: "search_sop", query: `documents ${n++}` } });
  const r = await reactAnswer(SOP, "x", { retrieve, reasoner: loop, maxSteps: 3 });
  assert.equal(r.status, "outside_kb");
  assert.equal(r.steps.filter((s) => s.action.tool === "search_sop").length, 3);
});

test("ReAct: the glossary maps everyday words to SOP words", () => {
  assert.match(rewrite("Which papers for my commercial permit?"), /documents.*trade licence/);
});

test("ReAct: a question about a place the SOP never mentions is not answered from shared words", async () => {
  const r = await reactAnswer(SOP, "can I renew my trade licence in Dubai instead", { retrieve });
  assert.equal(r.status, "outside_kb");
  assert.match(r.steps.map((s) => s.observation).join(" "), /Dubai/);
});
