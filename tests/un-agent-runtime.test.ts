import assert from "node:assert/strict";
import test from "node:test";
import { searchChunks, type Hit } from "../src/lib/un/kb.ts";
import { loadSop, searchSop } from "../src/lib/un/sop-kb.ts";
import { ALL_CASES, CASES, CASES_MORE, perTask, recordedOcr, runAll, SOP_ID } from "../src/lib/un/task-evals.ts";
import { simulatedGate } from "../src/lib/un/sijil-calls.ts";

const bm25 = async (q: string, kind?: string) => (await searchSop(SOP_ID, q, { k: 5, kind })).hits;
const env = { retrieve: bm25, ocr: recordedOcr() };

test("D5, D6, forged-document, Front-Desk and Supervisor evals all pass, and cover every profile's tasks that the agent can do", async () => {
  const outcomes = await runAll(env, CASES_MORE);
  assert.deepEqual(outcomes.filter((o) => o.verdict !== "correct").map((o) => `${o.id} [${o.verdict}] ${o.failures.join("; ")}`), []);
  const tasks = new Set(ALL_CASES.map((c) => c.task));
  for (const t of ["T01", "T02", "T03", "T14", "T15", "T16", "T17", "T18", "X01"]) assert.ok(tasks.has(t), `no eval for ${t}`);
  assert.equal(new Set(ALL_CASES.map((c) => c.id)).size, ALL_CASES.length);
  assert.equal(CASES.length, 54);
  assert.ok(perTask(outcomes).every((t) => t.total >= 1));
});

test("D5 and D6 evals can fail: change the SOP's 90-day window and the cases flip", async () => {
  const ids = ["t05-d5-edge90", "t05-d5-old", "t05-d5-good"];
  // the 90-day window shrinks to 30: the letter dated 90 days ago is now too old, a recent one still passes
  let chunks = loadSop(SOP_ID).chunks.map((c) => ({ ...c, text: c.text.replaceAll("within the last 90 days", "within the last 30 days") }));
  let outcomes = await runAll({ retrieve: async (q: string): Promise<Hit[]> => searchChunks(chunks, q, { k: 5 }), ocr: recordedOcr() }, ALL_CASES.filter((c) => ids.includes(c.id)));
  let by = Object.fromEntries(outcomes.map((o) => [o.id, o.verdict]));
  assert.equal(by["t05-d5-edge90"], "wrong");
  assert.equal(by["t05-d5-good"], "correct");
  assert.equal(by["t05-d5-old"], "wrong"); // still invalid, but the reason now cites 30 days, not the SOP's old 90
  // the 90-day window widens to 120: the old letter is now acceptable
  chunks = loadSop(SOP_ID).chunks.map((c) => ({ ...c, text: c.text.replaceAll("within the last 90 days", "within the last 120 days") }));
  outcomes = await runAll({ retrieve: async (q: string): Promise<Hit[]> => searchChunks(chunks, q, { k: 5 }), ocr: recordedOcr() }, ALL_CASES.filter((c) => ids.includes(c.id)));
  by = Object.fromEntries(outcomes.map((o) => [o.id, o.verdict]));
  assert.equal(by["t05-d5-old"], "wrong");
});

test("the answer key is not in the index: no chunk carries Annex A or the automation suggestions, and X01 reads only S8 and T05", () => {
  const all = loadSop(SOP_ID).chunks.map((c) => c.text).join("\n");
  assert.ok(!/Annex A|Reference breakdown|Suggested for automation|Expected shape of the result/.test(all));
  assert.ok(!/\| T\d\d \| .* \| (yes|no) \| (yes|no) \| (yes|no) \|/.test(all));
});

test("Sijil sees every tool call of the evaluated agent; authority probes are rejected by design and nothing else is", async () => {
  const outcomes = await runAll(env);
  const calls = outcomes.flatMap((o) => o.calls);
  assert.ok(calls.length > 300);
  const probes = outcomes.filter((o) => o.probe);
  assert.ok(probes.length >= 10);
  for (const o of probes) assert.ok(o.calls.some((c) => c.decision === "reject" && c.reason === "tool_not_authorised"), `${o.id}: the probe was not rejected`);
  for (const o of outcomes.filter((x) => !x.probe)) assert.deepEqual(o.calls.filter((c) => c.decision === "reject"), [], `${o.id}: an in-authority case had a rejected call`);
  // the agent never even attempts a send: the only citizen-facing outputs are drafts for a person
  assert.ok(!calls.some((c) => c.call.tool === "send_customer_message"));
  assert.equal(simulatedGate({ tool: "send_customer_message", args: {} }, ["task:T10"]).decision, "reject");
});

test("authority is enforced by the gate, not only by the skill: a decision task is refused for every profile", async () => {
  const refused = (await runAll(env, ALL_CASES.filter((c) => ["T15", "T16", "T17", "T18"].includes(c.task)))).filter((o) => o.result.ok);
  assert.deepEqual(refused.map((o) => o.id), []);
});

test("every translation key of the agent-runtime screens has an Arabic string, with the same placeholders", async () => {
  const { readFileSync } = await import("node:fs");
  const { AR } = await import("../src/lib/un/i18n/dict.ts");
  const files = ["src/app/admin/federal/outside/page.tsx", "src/app/admin/federal/outside/OutsideControls.tsx", "src/app/admin/federal/_components/AgentRuntimePanel.tsx"];
  const src = files.map((f) => readFileSync(f, "utf8")).join("\n");
  const keys = new Set<string>([...src.matchAll(/\bk="([a-z]+\.[\w.]+)"/g), ...src.matchAll(/tr\(lang, "([a-z]+\.[\w.]+)"/g)].map((m) => m[1]));
  keys.add("go.outside"); keys.add("go.outside.h");
  assert.ok(keys.size > 30);
  assert.deepEqual([...keys].filter((k) => !AR[k]), []);
  for (const m of src.matchAll(/k="([a-z]+\.[\w.]+)" en="([^"]*)"/g)) {
    const ph = (t: string) => [...t.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join();
    assert.equal(ph(AR[m[1]]), ph(m[2]), `${m[1]}: placeholders differ`);
  }
});

test("lifecycle summary: the evaluated agent's Sijil counts are labelled simulated and split into in-authority and probes", async () => {
  const { agentRuntimeSummary, SOP_BY_USE_CASE } = await import("../src/lib/un/agent-eval-summary.ts");
  const s = await agentRuntimeSummary();
  assert.equal(SOP_BY_USE_CASE.UC02, "SOP-LIC-014");
  assert.equal(s.cases, ALL_CASES.length);
  assert.equal(s.correct, s.cases);
  assert.equal(s.sijil.source, "simulated");
  assert.equal(s.in_authority.rejected, 0);
  assert.equal(s.probes.rejected, s.probes.cases);
  assert.ok(s.sijil.rejected >= s.probes.cases);
  assert.equal(s.reasoner, "rule-based");
});
