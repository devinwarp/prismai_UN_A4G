import assert from "node:assert/strict";
import test from "node:test";
import { expectedCsv, expectedMarkdown, expectedVsActual, matchSummary } from "../src/lib/un/expected.ts";
import { nextStep, startRun, type RunEnv, type RunState } from "../src/lib/un/scenario.ts";
import { S1, S2 } from "../src/lib/un/scenarios.ts";
import { loadChunksFrom } from "./helpers-un.ts";

const env: RunEnv = { now: () => "2026-11-09T08:00:00Z", chunks: loadChunksFrom() };
const finished = async (sc: typeof S1 | typeof S2) => { let r: RunState = startRun(sc, "r"); while (!r.done) r = await nextStep(sc, r, env); return r; };

test("C2-8: one row per released step with expected, actual and match", async () => {
  const rows = expectedVsActual((await finished(S1)).steps);
  assert.deepEqual(rows.map((r) => [r.step, r.expected, r.actual, r.match]), [
    ["T0", "ESCALATE", "ESCALATE", true], ["T1", "NO_GO", "NO_GO", true], ["T2", "NO_GO", "NO_GO", true],
    ["T3", "ASSISTANT_ONLY", "ASSISTANT_ONLY", true], ["T4", "GO_SUPERVISED", "GO_SUPERVISED", true],
  ]);
  assert.equal(matchSummary(rows), "5 of 5 steps match the expected outcome");
});

test("C2-8: a partly released run exports only what was released, and a mismatch shows as no", async () => {
  let r = startRun(S2, "r");
  r = await nextStep(S2, r, env);
  assert.equal(expectedVsActual(r.steps).length, 1);
  const rows = expectedVsActual([{ step: "T1", expected: "NO_GO", outcome: "ESCALATE", match: false }]);
  assert.match(expectedCsv(rows), /T1,NO_GO,ESCALATE,no/);
  assert.match(expectedMarkdown(rows), /\| T1 \| NO_GO \| ESCALATE \| ✕ \|/);
});

test("C2-8: the dashboard lines of portfolio steps export too, and commas in the dashboard line are quoted in CSV", async () => {
  const rows = expectedVsActual([{ step: "T1", expected: "deployed 6/20 (30%), compliant 0/20", outcome: "deployed 6/20 (30%), compliant 0/20", match: true }]);
  assert.match(expectedCsv(rows), /"deployed 6\/20 \(30%\), compliant 0\/20"/);
});
