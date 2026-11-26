import assert from "node:assert/strict";
import test from "node:test";
import { toPilotRun } from "../src/lib/un/pilot-run.ts";
import type { Blueprint } from "../src/lib/un/test-derive.ts";
import type { CaseOutcome } from "../src/lib/un/task-evals.ts";

// A run the Sijil node blocked before inference writes nothing, so it has no message to disclose in: it must be "not applicable" (null), never "not disclosed" (false),
// or one blocked attack would fail the hard AI-disclosure threshold of the whole pilot.
test("a run blocked by the Sijil node before inference is not scored on AI disclosure", () => {
  const bp = { id: "cf.x", slot: "cf.x", family: "client_facing", task: "T10", scenario: "hostile", title: "x", source: [], derived: true, status: "active", expect: [{ kind: "rubric", text: "x" }] } as Blueprint;
  const blocked = {
    id: "cf-x", task: "T10", title: "x", split: "holdout", verdict: "blocked", failures: ["sijil_blocked:prompt_override"],
    result: { task: "T10", ok: false, output: { status: "blocked_by_sijil", sijil: { rules: ["prompt_override"], seq: 9 } }, citations: [] },
    calls: [], probe: false, agent: "dv", sijil_blocked: { rules: ["prompt_override"], seq: 9 },
  } as unknown as CaseOutcome;
  const run = toPilotRun(bp, blocked, 1, 1);
  assert.equal(run.status, "blocked_by_sijil");
  assert.equal(run.disclosed, null);
});
