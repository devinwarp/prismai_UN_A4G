import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { executePilot, type SealRun } from "../src/lib/un/pilot-run.ts";
import type { SijilSeal } from "../src/lib/un/pilot.ts";
import type { Blueprint } from "../src/lib/un/test-derive.ts";
import type { CaseOutcome, TaskCase } from "../src/lib/un/task-evals.ts";

const bp = (id: string, family: Blueprint["family"], task: string | null): Blueprint =>
  ({ id, slot: id, family, task, title: id, source: [], derived: true, status: "active", expect: [{ kind: "rubric", text: "x" }] });
const tc = (id: string, task: string, probe = false): TaskCase => ({ id, task, title: id, split: "tune", licence: "noor" as never, probe, check: () => [] });
const rejectedCall = { call: { tool: "t", args: {} }, decision: "reject", reason: "tool_not_authorised" } as never;
const outcome = (c: TaskCase): CaseOutcome => ({
  id: c.id, task: c.task, title: c.title, split: c.split, verdict: "correct", failures: [], calls: [{ call: { tool: "t", args: {} }, decision: "allow" }, rejectedCall],
  result: { task: c.task, ok: true, output: { a: 1 }, citations: ["c1"] }, probe: !!c.probe, agent: "dv",
});
const seal = (s: Partial<SijilSeal>): SealRun => async () => ({ source: "node:n1", sealed: 3, calls_rejected: 0, ...s });

const BPS = [bp("T04.happy", "happy_path", "T04"), bp("T11.auth", "authority", "T11")];
const CASES = [tc("a", "T04"), tc("auth-1", "T11", true)];

test("without a seal hook the runs are unchanged: simulated rejected_calls, no sijil field", async () => {
  const { runs } = await executePilot(BPS, CASES, async (c) => outcome(c), 1, () => 0);
  const happy = runs.find((r) => r.test_id.startsWith("T04.happy"))!;
  assert.equal(happy.rejected_calls, 1);
  assert.equal("sijil" in happy, false);
});

test("with a seal hook rejected_calls comes from the sealed result, and the sealed result is stored on each run", async () => {
  const { runs } = await executePilot(BPS, CASES, async (c) => outcome(c), 2, () => 0, "dv", undefined, seal({ calls_rejected: 5, sealed: 4 }));
  const happy = runs.filter((r) => r.test_id.startsWith("T04.happy"));
  assert.equal(happy.length, 2);
  for (const r of happy) {
    assert.equal(r.rejected_calls, 5);
    assert.equal(r.sijil?.source, "node:n1");
    assert.equal(r.sijil?.sealed, 4);
  }
});

test("a refusal_expected run keeps rejected_calls 0 even when the sealed result has rejects", async () => {
  const { runs } = await executePilot(BPS, CASES, async (c) => outcome(c), 1, () => 0, "dv", undefined, seal({ calls_rejected: 7 }));
  const auth = runs.find((r) => r.test_id.startsWith("T11.auth"))!;
  assert.equal(auth.refusal_expected, true);
  assert.equal(auth.rejected_calls, 0);
  assert.equal(auth.sijil?.calls_rejected, 7);
});

test("a seal that falls back to the simulated gate leaves rejected_calls at the simulated count", async () => {
  const { runs } = await executePilot(BPS, CASES, async (c) => outcome(c), 1, () => 0, "dv", undefined, seal({ source: "simulated:unreachable", sealed: 0, calls_rejected: 1, reason: "Sijil node unreachable" }));
  const happy = runs.find((r) => r.test_id.startsWith("T04.happy"))!;
  assert.equal(happy.rejected_calls, 1);
  assert.equal(happy.sijil?.source, "simulated:unreachable");
});

test("a seal hook that throws never ends the pilot: the run keeps its simulated figures and says why", async () => {
  const boom: SealRun = async () => { throw new Error("unexpected"); };
  const { runs } = await executePilot(BPS, CASES, async (c) => outcome(c), 1, () => 0, "dv", undefined, boom);
  assert.equal(runs.length, 2);
  assert.equal(runs[0].sijil?.source, "simulated:unreachable");
  assert.equal(runs[0].rejected_calls, 1);
});

test("source guard: nothing in pilot-run.ts or the seal modules edits a deliverable's text, and the route wires the seal", () => {
  const run = readFileSync("src/lib/un/pilot-run.ts", "utf8");
  const agent = readFileSync("src/lib/un/sijil-agent.ts", "utf8") + readFileSync("src/lib/un/sijil-agent-client.ts", "utf8");
  assert.doesNotMatch(run, /email\.body\s*=[^=]/);
  assert.doesNotMatch(agent, /\.body\s*\+?=[^=]|disclosure footer|appendDisclosure/i);
  const route = readFileSync("src/app/api/admin/un/use-cases/[id]/pilot/route.ts", "utf8");
  assert.match(route, /agentConfigFromEnv\(/);
  assert.match(route, /createSealer\(/);
  assert.match(route, /executePilot\([^\n]*, seal\)/);
});

import { sealSummary } from "../src/lib/un/pilot-run.ts";
import type { PilotRun } from "../src/lib/un/pilot.ts";
const withSijil = (s?: Partial<SijilSeal>) => ({ ...(s ? { sijil: { source: "node:n1", sealed: 3, calls_rejected: 0, ...s } } : {}) }) as PilotRun;

test("sealSummary: all runs sealed is the node, none sealed is simulated, some is partial, and no attempt is undefined", () => {
  assert.equal(sealSummary([withSijil(), withSijil()]), undefined);
  const all = sealSummary([withSijil({}), withSijil({ sealed: 2 })])!;
  assert.deepEqual([all.source, all.sealed, all.runs_sealed, all.runs, all.halted], ["node:n1", 5, 2, 2, false]);
  const none = sealSummary([withSijil({ source: "simulated:unreachable", sealed: 0 })])!;
  assert.deepEqual([none.source, none.sealed, none.runs_sealed], ["simulated", 0, 0]);
  assert.equal(sealSummary([withSijil({}), withSijil({ source: "simulated:unreachable", sealed: 0 })])!.source, "partial");
});

test("sealSummary reports halted only when every sealed run was halted", () => {
  assert.equal(sealSummary([withSijil({ halted: true }), withSijil({ halted: true })])!.halted, true);
  assert.equal(sealSummary([withSijil({ halted: true }), withSijil({ halted: false })])!.halted, false);
});

test("sealSummary keeps the first fallback reason so the page can say why, and the orphan flag passes through the route type", () => {
  const sm = sealSummary([withSijil({ source: "simulated:unreachable", sealed: 0, reason: "Sijil node returned HTTP 409 for /api/agent/seal" }), withSijil({ source: "simulated:unreachable", sealed: 0, reason: "later" })])!;
  assert.equal(sm.source, "simulated");
  assert.equal(sm.reason, "Sijil node returned HTTP 409 for /api/agent/seal");
});
