import assert from "node:assert/strict";
import test from "node:test";
import { evaluate, stubLlm, summarise, toMarkdown, wilson } from "../scripts/eval_agents.ts";
import { runAgent } from "../src/lib/un/agents.ts";
import { adhocError, adhocStep, nextStep, startRun, type RunEnv } from "../src/lib/un/scenario.ts";
import { S1 } from "../src/lib/un/scenarios.ts";
import { searchChunks } from "../src/lib/un/kb.ts";
import { tamperLast } from "../src/lib/un/tamper.ts";
import { verifyLog, type TraceRecord } from "../src/lib/un/trace.ts";
import { loadChunksFrom } from "./helpers-un.ts";

const chunks = loadChunksFrom();
const env: RunEnv = { now: () => "2026-11-19T08:00:00Z", chunks };
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 5e-4, `${a} vs ${b}`);

test("Wilson interval matches known values and behaves at the edges", () => {
  const z = wilson(0, 20);
  near(z.lo, 0); near(z.hi, 0.1611);
  const h = wilson(10, 20);
  near(h.lo, 0.2993); near(h.hi, 0.7007);
  const a = wilson(20, 20);
  near(a.hi, 1); near(a.lo, 0.8389);
  assert.deepEqual([wilson(0, 0).lo, wilson(0, 0).hi], [0, 1]);
});

test("dry eval with the stub model counts runs, citations and provenance, with no network", async () => {
  const t = await evaluate({ n: 3, scenarios: ["S1"], chunks, llm: stubLlm(), model: "stub" });
  assert.equal(t.S1.runs, 3);
  assert.ok(t.S1.calls > 0 && t.S1.llmMessages > 0);
  assert.ok(t.S1.citedKbExists <= t.S1.citedKb && t.S1.citedKbRetrieved <= t.S1.citedKb);
  assert.ok(t.S1.parseFailures > 0, "stub returns non-JSON every 7th call");
  const md = toMarkdown(summarise(t), { model: "stub", base: "-", n: 3, dry: true, at: "now" });
  assert.match(md, /DRY RUN/);
  assert.match(md, /95% CI/);
});

test("model-written messages carry model id and prompt hash; deterministic ones do not", async () => {
  let n = 0;
  const deps = { search: (q: string) => searchChunks(chunks, q, { k: 4, mix: true }), nextId: () => `m${++n}`, model: "m-test" };
  const e = { id: "e1", type: "incident", summary: "not on certified hosting", gate: "approved_infrastructure" as const, status: "fail" as const };
  const ctx = { ext_id: "UC02", title: "t", clientFacing: true, events: [e], thread: [] };
  const llm = async () => JSON.stringify({ messages: [{ type: "EVIDENCE", reason: "x", evidence: ["e1"], kb: [] }] });
  const added = (await runAgent("security", ctx, { ...deps, llm })).filter((m) => m.llm);
  assert.equal(added.length, 1);
  assert.equal(added[0].llm!.model, "m-test");
  assert.match(added[0].llm!.prompt_sha256, /^[0-9a-f]{64}$/);
  assert.ok((await runAgent("security", ctx, deps)).every((m) => !m.llm));
});

test("model is add-only: out-of-turn gate status dropped, in-turn agreeing message kept", async () => {
  let n = 0;
  const deps = { search: (q: string) => searchChunks(chunks, q, { k: 4, mix: true }), nextId: () => `m${++n}`, model: "m" };
  const e = { id: "e1", type: "incident", summary: "not on certified hosting", gate: "approved_infrastructure" as const, status: "fail" as const };
  const ctx = { ext_id: "UC02", title: "t", clientFacing: true, events: [e], thread: [] };
  const msg = (gate: string, status: string) => ({ type: "CHALLENGE", gate, status, reason: "x", evidence: ["e1"], kb: [] });
  const run = async (...ms: object[]) => (await runAgent("security", ctx, { ...deps, llm: async () => JSON.stringify({ messages: ms }) })).filter((m) => m.llm);
  assert.equal((await run(msg("data_lawful", "fail"))).length, 0, "other gate, not addressed by the rules this turn");
  assert.equal((await run(msg("approved_infrastructure", "pass"))).length, 0, "same gate, flipped status");
  assert.equal((await run(msg("approved_infrastructure", "fail"))).length, 1, "same gate, agrees");
});

test("logs without the llm field still verify, and the field is covered by the hash", async () => {
  const old = await nextStep(S1, startRun(S1, "o"), env);
  assert.ok(old.log.every((r) => !r.llm) && verifyLog(old.log).ok);
  let run = startRun(S1, "r");
  while (!run.done) run = await nextStep(S1, run, { ...env, model: "m", llm: stubLlm() });
  assert.ok(verifyLog(run.log).ok);
  const i = run.log.findIndex((r) => r.llm);
  assert.ok(i >= 0, "the stub adds at least one model message");
  const forged = structuredClone(run.log);
  forged[i].llm!.model = "other";
  assert.equal(verifyLog(forged).brokenAt, i);
});

test("ad-hoc step: validated, logged, hash-chained, does not advance the script", async () => {
  assert.match(adhocError({ summary: "", recipients: ["security"] })!, /Summary/);
  assert.match(adhocError({ summary: "x", recipients: [] })!, /recipient/);
  assert.match(adhocError({ summary: "x", recipients: ["coordinator" as never] })!, /recipient/);
  assert.match(adhocError({ summary: "x", recipients: ["security"], gate: "audit_log" })!, /together/);
  assert.match(adhocError({ summary: "x", recipients: ["security"], gate: "nope" as never, status: "fail" })!, /Unknown gate/);
  assert.match(adhocError({ summary: "x", recipients: ["security"], gate: "audit_log", status: "unknown" as never })!, /Status/);
  assert.match(adhocError({ summary: "x", recipients: ["security"], expected: "MAYBE" })!, /expected/);
  assert.equal(adhocError({ summary: "x", recipients: ["security"], gate: "audit_log", status: "fail", expected: "NO_GO" }), null);

  let run = await nextStep(S1, startRun(S1, "r"), env);
  const before = run.log.length;
  run = await adhocStep(S1, run, { summary: "Audit log was found to have gaps", gate: "audit_log", status: "fail", recipients: ["security"], expected: "NO_GO" }, env);
  assert.equal(run.next, 1);
  assert.equal(run.done, false);
  assert.ok(run.log.length > before && verifyLog(run.log).ok);
  const s = run.steps[run.steps.length - 1];
  assert.equal(s.step, "A1");
  assert.equal(s.adhoc, true);
  assert.equal(s.outcome, "NO_GO");
  assert.ok(s.match);
  assert.ok(run.log.slice(before).every((r) => r.step === "A1"));
  const next = await adhocStep(S1, run, { summary: "context only", recipients: ["frontline"] }, env);
  assert.equal(next.steps[next.steps.length - 1].expected, "");
  assert.equal(next.steps[next.steps.length - 1].step, "A2");
  await assert.rejects(adhocStep(S1, run, { summary: "", recipients: ["security"] }, env));
});

test("tamper demo names the edited last record and leaves the original untouched", async () => {
  let run = startRun(S1, "r");
  while (!run.done) run = await nextStep(S1, run, env);
  const snapshot = JSON.stringify(run.log);
  const d = tamperLast(run.log);
  assert.equal(d.verification.ok, false);
  assert.equal(d.named, run.log[run.log.length - 1].trace_id);
  assert.equal(d.verification.brokenAt, run.log.length - 1);
  assert.equal(JSON.stringify(run.log), snapshot);
  assert.ok(verifyLog(run.log).ok);
  assert.equal(tamperLast([] as TraceRecord[]).edited, null);
});
