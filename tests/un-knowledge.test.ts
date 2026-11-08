import assert from "node:assert/strict";
import test from "node:test";
import { knowledgeByAgent } from "../src/lib/un/knowledge.ts";
import { nextStep, startRun, type RunEnv, type RunState } from "../src/lib/un/scenario.ts";
import { S1 } from "../src/lib/un/scenarios.ts";
import { loadChunksFrom } from "./helpers-un.ts";

const env: RunEnv = { now: () => "2026-11-09T08:00:00Z", chunks: loadChunksFrom() };
const finished = async () => { let r: RunState = startRun(S1, "r"); while (!r.done) r = await nextStep(S1, r, env); return r; };

test("C2-2: each agent's view lists only the events routed to it, per step", async () => {
  const run = await finished();
  const k = Object.fromEntries(knowledgeByAgent(run.steps).map((a) => [a.role, a]));
  assert.deepEqual(k.security.knows.map((e) => e.id), ["S1-T0-audit", "S1-T1-hosting", "S1-T4-hosting-retest"]);
  assert.deepEqual(k.security.received.map((e) => e.length), [1, 1, 0, 0, 1]); // nothing at T2, T3
  assert.deepEqual(k.compliance.knows.map((e) => e.step), ["T0", "T2", "T4"]);
});

test("C2-2: the uneven distribution is visible: security never saw the T2 approval failure", async () => {
  const run = await finished();
  const security = knowledgeByAgent(run.steps).find((a) => a.role === "security")!;
  assert.ok(security.unaware.some((e) => e.id === "S1-T2-hitl"));
  assert.ok(!security.knows.some((e) => e.id === "S1-T2-hitl"));
  const innovator = knowledgeByAgent(run.steps).find((a) => a.role === "innovator")!;
  assert.deepEqual(innovator.knows.map((e) => e.id), ["S1-T0-baseline", "S1-T3-hosting-fix", "S1-T3-hitl-fix"]);
});

test("C2-2: a step that has not been released yet shows nothing, and unreleased events are not listed", async () => {
  let r: RunState = startRun(S1, "r");
  r = await nextStep(S1, r, env);
  const view = knowledgeByAgent(r.steps);
  assert.ok(view.every((a) => a.received.length === 1));
  assert.ok(!view.some((a) => a.knows.some((e) => e.step !== "T0")));
  assert.ok(!view.some((a) => a.unaware.some((e) => e.step !== "T0")));
});
