import assert from "node:assert/strict";
import test from "node:test";
import { SijilBlockedError } from "../src/lib/llm.ts";
import { llmReasoner, llmReflector, SYSTEM, REFLECT_SYSTEM, type ChatFn } from "../src/lib/un/react-llm.ts";
import { reactAnswer } from "../src/lib/un/react-sop.ts";
import { searchSop } from "../src/lib/un/sop-kb.ts";
import { recordedOcr, runCase, SOP_ID, type TaskCase } from "../src/lib/un/task-evals.ts";
import { SEED_QUESTIONS, runQuestions } from "../src/lib/un/tuning-bank.ts";
import { DEFAULT_REACT_CONFIG } from "../src/lib/un/react-config.ts";
import { sijilScoreOf, type TaskRow } from "../src/lib/un/tuning-service.ts";
import type { QResult } from "../src/lib/un/tuning-bank.ts";

const SOP = "SOP-LIC-014";
const retrieve = async (q: string, kind?: string) => (await searchSop(SOP, q, { k: 5, kind })).hits;
const reply = (thought: string, action: object) => JSON.stringify({ thought, action });
const block = () => Promise.reject(new SijilBlockedError(["agent_to_agent"], 11));

async function run(question: string, opts: { reasoner?: ReturnType<typeof llmReasoner>["reasoner"]; reflect?: ReturnType<typeof llmReflector>["reflect"] }) {
  return reactAnswer(SOP, question, {
    retrieve,
    ...(opts.reasoner ? { reasoner: opts.reasoner } : {}),
    ...(opts.reflect ? { reflect: opts.reflect } : {}),
    requestOutside: async () => "queued",
  });
}

test("a Sijil block in the reasoner propagates: no fallback, no outside_kb", async () => {
  let fallbackCalls = 0;
  const m = llmReasoner({ chat: block, fallback: () => { fallbackCalls++; throw new Error("fallback must not run"); } });
  await assert.rejects(run("insurance certificate minimum cover", { reasoner: m.reasoner }), SijilBlockedError);
  assert.equal(fallbackCalls, 0);
  assert.equal(m.usage.fallbacks, 0);
});

test("a non-block reasoner error still falls back to the rule reasoner", async () => {
  const m = llmReasoner({ chat: () => Promise.reject(new Error("boom")) });
  const r = await run("insurance certificate minimum cover", { reasoner: m.reasoner });
  assert.ok(r.status);
  assert.equal(m.usage.fallbacks > 0, true);
});

test("a Sijil block in the reflector propagates instead of a refused finish", async () => {
  let i = 0;
  const script: ChatFn = async () => (++i === 1
    ? reply("search", { tool: "search_sop", query: "insurance certificate minimum cover" })
    : reply("cite", { tool: "finish", citations: ["SOP-LIC-014#D4"] }));
  const m = llmReasoner({ chat: script });
  const ref = llmReflector({ chat: block });
  await assert.rejects(run("insurance certificate minimum cover", { reasoner: m.reasoner, reflect: ref.reflect }), SijilBlockedError);
});

test("runCase turns a Sijil block into a counted blocked_by_sijil outcome", async () => {
  const bm25 = async (q: string, kind?: string) => (await searchSop(SOP_ID, q, { k: 5, kind })).hits;
  const ask = SEED_QUESTIONS[0];
  void ask;
  const askCase: TaskCase = { id: "ask-blocked", task: "ASK", title: "blocked", split: "tune", licence: "noor", ask: "insurance certificate minimum cover", check: () => ["must not be checked: the run was blocked"] };
  const outcome = await runCase(askCase,
    { retrieve: bm25, ocr: recordedOcr(), reasoner: async () => { throw new SijilBlockedError(["prompt_override"], 42); } });
  assert.equal(outcome.verdict, "blocked");
  assert.equal(outcome.result.output.status, "blocked_by_sijil");
  assert.deepEqual(outcome.sijil_blocked, { rules: ["prompt_override"], seq: 42 });
  assert.ok(outcome.failures[0].startsWith("sijil_blocked:prompt_override"));
});

test("runQuestions marks only the blocked question as sijil_blocked", async () => {
  const bm25 = async (q: string, kind?: string) => (await searchSop(SOP, q, { k: 5, kind })).hits;
  let calls = 0;
  const reasoner = async () => { calls++; if (calls === 1) throw new SijilBlockedError(["agent_to_agent"], 9); return { thought: "x", action: { tool: "request_outside_information" as const, question: "q", reason: "r" } }; };
  const out = await runQuestions(SOP, DEFAULT_REACT_CONFIG, SEED_QUESTIONS.slice(0, 2), bm25, { reasoner });
  assert.equal(out[0].verdict, "sijil_blocked");
  assert.deepEqual(out[0].sijil_block, { rules: ["agent_to_agent"], seq: 9 });
  assert.notEqual(out[1].verdict, "sijil_blocked");
});

test("sijilScoreOf splits question and task blocks into attacks stopped and alignment", () => {
  const q = (id: string, expect: QResult["expect"], block?: { rules: string[]; seq: number }): QResult =>
    ({ id, question: "q", split: "tune", expect, verdict: block ? "sijil_blocked" : "correct", status: "answered", citations: [], steps: [], ...(block ? { sijil_block: block } : {}) });
  const row = (id: string, attack: boolean, rules: string[]): TaskRow =>
    ({ id, task: "T04", title: "t", split: "tune", verdict: "blocked", failures: [`sijil_blocked:${rules.join(",")}`], sijil_blocked: { rules, seq: 1, attack } });
  const s = sijilScoreOf(
    [q("q1", { outside: true }, { rules: ["agent_to_agent"], seq: 1 }), q("q2", { chunks: ["SOP-LIC-014#D4"] }, { rules: ["prompt_override"], seq: 2 }), q("q3", { chunks: ["SOP-LIC-014#D4"] })],
    [row("c1", true, ["agent_to_agent"]), row("c2", false, ["prompt_override"])]);
  assert.ok(s);
  assert.equal(s.blocks, 4);
  assert.equal(s.attacks_stopped, 2);
  assert.equal(s.alignment, 2);
  assert.equal(s.allowed, false);
  assert.deepEqual(s.by_rule, { agent_to_agent: 2, prompt_override: 2 });
  const attackOnly = sijilScoreOf([q("q1", { outside: true }, { rules: ["x"], seq: 1 })], []);
  assert.equal(attackOnly!.allowed, true);
  const cleanRow: TaskRow = { id: "c9", task: "T04", title: "t", split: "tune", verdict: "correct", failures: [] };
  assert.equal(sijilScoreOf([q("q3", { chunks: ["SOP-LIC-014#D4"] })], [cleanRow]), undefined);
});

test("shipped reasoner prompts do not contain the demo's forbidden phrasing", () => {
  for (const p of [SYSTEM, REFLECT_SYSTEM]) assert.ok(!/message another agent/i.test(p));
});
