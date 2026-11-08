import assert from "node:assert/strict";
import test from "node:test";
import { runAgent, type AgentContext } from "../src/lib/un/agents.ts";
import { excerpt, searchChunks, type Chunk } from "../src/lib/un/kb.ts";
import { reconcile } from "../src/lib/un/protocol.ts";

const mk = (id: string, jurisdiction: string, text: string): Chunk => ({
  chunk_id: id, source_id: id.split("#")[0], text, sha256: "x", title: id, url: "u", issuer: "i",
  jurisdiction, instrument_type: "framework", binding: false, date: null, topics: [], matrix_quadrants: [],
});
const chunks = [
  mk("charter#0", "UAE-federal", "AI systems must remain under human oversight. Citizens must be informed when they interact with AI."),
  mk("sg#0", "Singapore", "Agentic AI needs meaningful human accountability and oversight across the lifecycle."),
  mk("nist#0", "US", "Measure hallucination and robustness of the model in production."),
  mk("desc#0", "Dubai", "Hosting must use certified cloud infrastructure."),
];
let n = 0;
const deps = { search: (q: string) => searchChunks(chunks, q, { k: 4, mix: true }), nextId: () => `m${++n}` };
const has = (id: string) => chunks.some((c) => c.chunk_id === id);

test("BM25 finds the right chunk; mix returns UAE and global", () => {
  assert.equal(searchChunks(chunks, "hallucination robustness", { k: 1 })[0].chunk.chunk_id, "nist#0");
  const mixed = searchChunks(chunks, "human oversight accountability", { k: 2, mix: true });
  assert.deepEqual(mixed.map((h) => h.chunk.jurisdiction).sort(), ["Singapore", "UAE-federal"]);
});

test("excerpt is a verbatim sentence", () => {
  const e = excerpt(chunks[0].text, "informed interact with AI");
  assert.ok(chunks[0].text.includes(e));
  assert.match(e, /informed/);
});

const ctx = (over: Partial<AgentContext>): AgentContext => ({
  ext_id: "UC02", title: "Renewal pre-check", clientFacing: true, events: [], thread: [], ...over,
});

test("an agent only reacts to events it received, and only for gates it owns", async () => {
  const hosting = { id: "evt_T1", type: "incident", summary: "Model endpoint is not on certified hosting", gate: "approved_infrastructure" as const, status: "fail" as const };
  assert.equal((await runAgent("compliance", ctx({ events: [hosting] }), deps)).length, 0);
  assert.equal((await runAgent("security", ctx({}), deps)).length, 0); // not shown the event
  const [m] = await runAgent("security", ctx({ events: [hosting] }), deps);
  assert.equal(m.type, "CHALLENGE");
  assert.deepEqual(m.evidence, ["evt_T1"]);
  assert.ok(m.kb.every(has));
});

test("the model can add messages but not contradict the rules or cite unseen ids", async () => {
  const hosting = { id: "evt_T1", type: "incident", summary: "not on certified hosting", gate: "approved_infrastructure" as const, status: "fail" as const };
  const llm = async () => JSON.stringify({ messages: [
    { type: "EVIDENCE", gate: "approved_infrastructure", status: "pass", reason: "fine", evidence: ["evt_T1"], kb: [] },
    { type: "EVIDENCE_REQUEST", reason: "need the region", evidence: ["evt_FAKE"], kb: ["ghost#9"] },
  ] });
  const out = await runAgent("security", ctx({ events: [hosting] }), { ...deps, llm });
  assert.equal(out.filter((m) => m.gate === "approved_infrastructure").length, 1);
  assert.equal(out[0].status, "fail");
  assert.deepEqual(out[1].evidence, []);
  assert.deepEqual(out[1].kb, []);
});

test("bad model output falls back to deterministic mode", async () => {
  const e = { id: "e1", type: "x", summary: "audit log missing", gate: "audit_log" as const, status: "fail" as const };
  const out = await runAgent("security", ctx({ events: [e] }), { ...deps, llm: async () => "not json" });
  assert.equal(out.length, 1);
});

test("agents' messages flow through the coordinator to a verdict", async () => {
  const e = { id: "evt_T1", type: "incident", summary: "hosting not certified", gate: "approved_infrastructure" as const, status: "fail" as const };
  const msgs = await runAgent("security", ctx({ events: [e] }), deps);
  const r = reconcile({ ext_id: "UC02", clientFacing: true, requested: "GO_AUTONOMOUS", gates: {} }, msgs, has);
  assert.equal(r.rejected.length, 0);
  assert.equal(r.decision.verdict, "NO_GO");
});

import { runRound, type RoutedEvent } from "../src/lib/un/round.ts";
import type { CaseState } from "../src/lib/un/protocol.ts";
import type { RoleId } from "../src/lib/un/policy.ts";

test("S1 replay: staged events, uneven routing, verdict path from the audit", async () => {
  const ev = (id: string, to: RoleId[], summary: string, gate?: RoutedEvent["gate"], status?: RoutedEvent["status"]): RoutedEvent =>
    ({ id, type: "event", summary, recipients: to, gate, status });
  const rounds: RoutedEvent[][] = [
    [ev("T0a", ["innovator", "frontline", "policy_adviser"], "Pilot baseline: 96.8% agreement with officers"),
     ev("T0b", ["security"], "Audit log covers every action", "audit_log", "pass"),
     ev("T0c", ["privacy"], "DPA covers the data used", "data_lawful", "pass"),
     ev("T0d", ["compliance"], "Assistant disclosure shown on first message", "ai_disclosure", "pass")],
    [ev("T1", ["security"], "Model endpoint is not on certified hosting", "approved_infrastructure", "fail")],
    [ev("T2", ["compliance"], "Agent sends customer messages directly", "human_final_approval", "fail")],
    [ev("T3a", ["innovator"], "Owner moved the model to approved hosting", "approved_infrastructure", "fix_declared"),
     ev("T3b", ["innovator"], "Officer release restored", "human_final_approval", "fix_declared")],
    [ev("T4a", ["security"], "Re-test: endpoint is certified", "approved_infrastructure", "pass"),
     ev("T4b", ["compliance"], "Re-test: officer releases every message", "human_final_approval", "pass")],
  ];
  let state: CaseState = { ext_id: "UC02", clientFacing: true, requested: "ASSISTANT_ONLY", gates: {} };
  let thread: Awaited<ReturnType<typeof runRound>>["thread"] = [];
  const path: string[] = [];
  const everActive = new Set<RoleId>();
  for (const [i, events] of rounds.entries()) {
    const r = await runRound({ state, title: "Renewal pre-check", requested: i === 0 ? "GO_AUTONOMOUS" : undefined, thread, events }, deps, has);
    assert.deepEqual(r.rejected, []);
    r.active.forEach((a) => everActive.add(a));
    state = r.state;
    thread = r.thread;
    path.push(r.decision.verdict);
  }
  assert.deepEqual(path, ["ESCALATE", "NO_GO", "NO_GO", "ASSISTANT_ONLY", "GO_SUPERVISED"]);
  assert.ok(everActive.size >= 5);
  // the security agent never saw the compliance-only event
  assert.ok(!thread.some((m) => m.from === "security" && m.evidence.includes("T2")));
});
