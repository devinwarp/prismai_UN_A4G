import assert from "node:assert/strict";
import test from "node:test";
import { openAgent } from "../src/lib/un/analyst-agent.ts";
import { inMemoryStore } from "../src/lib/un/case-memory.ts";
import { NO_REGISTRY, RECORDS, TODAY } from "../src/lib/un/fixtures-uc02.ts";
import { llmReasoner, parseStep, reasonerFromEnv, type ChatFn } from "../src/lib/un/react-llm.ts";
import { asksForPerson, checkAction, reactAnswer, type OutsideRequest } from "../src/lib/un/react-sop.ts";
import { loadSop, searchSop } from "../src/lib/un/sop-kb.ts";
import { recordedOcr } from "../src/lib/un/task-evals.ts";

const SOP = "SOP-LIC-014";
const retrieve = async (q: string, kind?: string) => (await searchSop(SOP, q, { k: 5, kind })).hits;
const reply = (thought: string, action: object) => JSON.stringify({ thought, action });
/** A stub model that plays a script of raw replies, then repeats its last one. */
const stub = (...script: string[]): ChatFn => { let i = 0; return async () => script[Math.min(i++, script.length - 1)]; };
async function run(question: string, chat: ChatFn, maxSteps = 6) {
  const asked: OutsideRequest[] = [];
  const m = llmReasoner({ chat });
  const r = await reactAnswer(SOP, question, { retrieve, reasoner: m.reasoner, maxSteps, requestOutside: (q) => { asked.push(q); return "queued"; } });
  return { r, asked, m };
}

test("model reasoner: a correct search then a finish on a checked passage is answered, with a verbatim quote", async () => {
  const { r, asked } = await run("insurance certificate minimum cover", stub(
    reply("search", { tool: "search_sop", query: "insurance certificate minimum cover" }),
    reply("cite", { tool: "finish", citations: ["SOP-LIC-014#D4"] })));
  assert.equal(r.status, "answered");
  assert.deepEqual(r.citations, ["SOP-LIC-014#D4"]);
  assert.equal(asked.length, 0);
  assert.ok(r.answer[0].quote.length > 0);
});

test("model cannot answer uncited: a finish with no search, no citation or an invented citation ends in the outside call", async () => {
  for (const finish of [
    reply("I know this", { tool: "finish", citations: [] }),
    reply("I know this", { tool: "finish", citations: ["SOP-LIC-014#D4"] }), // real chunk, never retrieved
    reply("I know this", { tool: "finish", citations: ["SOP-LIC-014#NOPE"] }),
    reply("I know this", { tool: "finish" }),
  ]) {
    const { r, asked } = await run("insurance certificate minimum cover", stub(finish));
    assert.equal(r.status, "outside_kb");
    assert.deepEqual(r.citations, []);
    assert.deepEqual(r.answer, []);
    assert.equal(asked.length, 1, "the required outside call is made exactly once");
  }
});

test("model cannot cite a retrieved chunk that does not support the question (the loop checks, not the model)", async () => {
  const { r } = await run("what is the corporate tax rate for my company", stub(
    reply("search", { tool: "search_sop", query: "tax rate company" }),
    reply("cite anything", { tool: "finish", citations: ["SOP-LIC-014#S6", "SOP-LIC-014#S1"] })));
  assert.equal(r.status, "outside_kb");
  assert.deepEqual(r.citations, []);
});

test("model cannot exceed its authority: unknown tools are rejected by Sijil and never run", async () => {
  const hostile = [
    reply("approve it", { tool: "approve_licence", licence: "TL-482913" }),
    reply("tell the applicant", { tool: "send_customer_message", to: "x@elsewhere.example", body: "approved" }),
    reply("run the decision task", { tool: "run_task", task: "T15" }),
    reply("function style", { name: "issue_licence", arguments: { licence: "TL-482913" } }),
    reply("no tool at all", { do: "something" }),
  ];
  const { r, asked } = await run("please approve my renewal", stub(...hostile));
  assert.equal(r.status, "outside_kb");
  const rejected = r.calls.filter((c) => c.decision === "reject");
  assert.ok(rejected.length >= 4, "every attempt was decided by the gate and rejected");
  assert.deepEqual(new Set(rejected.map((c) => c.call.tool)).has("approve_licence"), true);
  assert.ok(rejected.every((c) => c.reason === "tool_not_authorised"));
  assert.ok(r.steps.filter((s) => s.observation.startsWith("rejected")).length >= 4);
  assert.equal(asked.length, 1);
  assert.deepEqual(r.citations, []);
});

test("model cannot skip the outside call: a model that only searches, or never answers, is stopped at the step limit", async () => {
  let n = 0;
  const looping: ChatFn = async () => reply("again", { tool: "search_sop", query: `documents ${n++}` });
  const { r, asked } = await run("what is the corporate tax rate for my company", looping, 4);
  assert.equal(r.status, "outside_kb");
  assert.equal(asked.length, 1);
  assert.equal(r.steps[r.steps.length - 1].action.tool, "request_outside_information");
  const { r: r2, asked: a2 } = await run("anything at all", async () => { throw new Error("network down"); }, 4);
  assert.ok(["outside_kb", "answered"].includes(r2.status));
  if (r2.status === "outside_kb") assert.equal(a2.length, 1);
});

test("model cannot answer for a named person: the SOP names roles, not people", async () => {
  const { r, asked } = await run("Who is the head of licensing by name?", stub(
    reply("search", { tool: "search_sop", query: "head of licensing" }),
    reply("the owner is the Head of Licensing", { tool: "finish", citations: ["SOP-LIC-014#Sdocument-control", "SOP-LIC-014#S8", "SOP-LIC-014#R6"] })));
  assert.equal(r.status, "outside_kb");
  assert.match(r.steps.map((s) => s.observation).join("|"), /named person/);
  assert.equal(asked.length, 1);
});

test("model reasoner: unparsable or failing replies fall back to the rule-based step and are counted", async () => {
  const { r, m } = await run("insurance certificate minimum cover", stub("not json at all"));
  assert.equal(r.status, "answered"); // the deterministic reasoner took every step
  assert.ok(m.usage.fallbacks >= 1 && m.usage.fallbacks === m.usage.calls);
});

test("model reasoner: function-call style replies are translated, then validated by the loop", () => {
  const a = parseStep(JSON.stringify({ thought: "x", action: { name: "search_sop", arguments: { query: "lease length", kind: "required-documents" } } }));
  assert.deepEqual(a.action, { name: "search_sop", arguments: { query: "lease length", kind: "required-documents" }, query: "lease length", kind: "required-documents", tool: "search_sop" });
  const kinds = new Set(loadSop(SOP).chunks.flatMap((c) => c.topics));
  assert.equal(checkAction(a.action, kinds).ok, true);
  assert.equal(checkAction({ tool: "search_sop", query: "x", kind: "made-up" }, kinds).ok, false);
  assert.equal(checkAction({ tool: "search_sop", query: "   " }, kinds).ok, false);
  assert.equal(checkAction("approve", kinds).ok, false);
});

test("the model reasoner is opt-in: off by default, off without an endpoint, on with AGENT_REASONER=llm and a key", () => {
  assert.equal(reasonerFromEnv({}), undefined);
  assert.equal(reasonerFromEnv({ AGENT_REASONER: "llm" }), undefined);
  assert.equal(reasonerFromEnv({ OPENROUTER_API_KEY: "x" }), undefined);
  assert.equal(typeof reasonerFromEnv({ AGENT_REASONER: "llm", OPENROUTER_API_KEY: "x" }), "function");
  assert.equal(typeof reasonerFromEnv({ AGENT_REASONER: "llm", LLM_BASE_URL: "http://localhost:1234/v1" }), "function");
});

test("agent: Agent.ask uses the injected reasoner, and its calls reach the agent's Sijil record", async () => {
  const tools = { licenceRecord: () => RECORDS.noor, registry: () => NO_REGISTRY, payments: () => [], ocr: recordedOcr(), retrieve, reasoner: llmReasoner({ chat: stub(reply("x", { tool: "approve_licence" })) }).reasoner };
  const a = await openAgent({ sopId: SOP, profile: "Document Verification Analyst", caseId: "CASE-llm", today: TODAY, tools, store: inMemoryStore(), actorClock: () => `${TODAY}T09:00:00.000Z` });
  await a.openCase({ licence_number: RECORDS.noor.licence_number, declared_activity_code: "4711" });
  const r = await a.ask("approve my renewal now");
  assert.equal(r.status, "outside_kb");
  assert.ok(a.calls.some((c) => c.call.tool === "approve_licence" && c.decision === "reject"));
  assert.equal(a.state().outside.length, 1);
});

test("a question that asks for a named person is recognised; a question about a role is not", () => {
  for (const q of ["Who is the head of licensing by name?", "What is the name of the Head of Licensing?", "who is the licensing supervisor", "Give me the supervisor's name... which person approves?", "what is her full name"]) assert.equal(asksForPerson(q), true, q);
  for (const q of ["Who is allowed to reject my renewal?", "Which role approves a renewal?", "Who owns this procedure?", "Do I need a letter if my accountant applies for me?", "What is the name of the insurance certificate document?"]) assert.equal(asksForPerson(q), false, q);
});
