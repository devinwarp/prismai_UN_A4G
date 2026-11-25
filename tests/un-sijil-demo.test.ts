import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_NOTE, DEMO_VERSIONS, demoBlueprintIds, DEMO_MODEL } from "../src/lib/un/sijil-screen-demo.ts";
import { NOTICE_SYSTEM } from "../src/lib/un/notice-draft.ts";
import { SYSTEM } from "../src/lib/un/react-llm.ts";
import { deriveTests } from "../src/lib/un/test-derive.ts";
import { profilesOf } from "../src/lib/un/sop/data.ts";
import { loadSop } from "../src/lib/un/sop-kb.ts";
import { ALL_CASES, SOP_ID } from "../src/lib/un/task-evals.ts";
import { generatedCases, planPilot } from "../src/lib/un/pilot-run.ts";

// The node's enforce phrase list (deploy/render/policy.yaml, vendored for tests in Task 7).
const ENFORCE_TERMS = [
  "system override", "ignore previous instructions", "ignore all previous instructions",
  "disregard your instructions", "you are now authorised", "you are now authorized",
  "message another agent", "send a message to another agent", "delegate this to another agent", "contact the other agent",
];

test("draft v1 carries a phrase the node refuses; draft v2 does not", () => {
  const v1 = DEMO_VERSIONS.find((v) => v.key === "draft-v1")!;
  const v2 = DEMO_VERSIONS.find((v) => v.key === "draft-v2")!;
  assert.ok(ENFORCE_TERMS.some((t) => (SYSTEM + v1.suffix).toLowerCase().includes(t) || (NOTICE_SYSTEM + v1.suffix).toLowerCase().includes(t)), "v1 must contain an enforce phrase");
  assert.ok(ENFORCE_TERMS.every((t) => !(SYSTEM + v2.suffix).toLowerCase().includes(t) && !(NOTICE_SYSTEM + v2.suffix).toLowerCase().includes(t)), "v2 must be clean");
  // and the forbidden phrase is not already in the shipped prompts (else every run would block, demo or not)
  for (const t of ENFORCE_TERMS) {
    assert.ok(!SYSTEM.toLowerCase().includes(t) && !NOTICE_SYSTEM.toLowerCase().includes(t), `shipped prompt contains "${t}"`);
  }
});

test("the demonstration is labelled with the mandated sentence", () => {
  assert.equal(DEMO_NOTE, "Simulated scenario: the draft prompt is written for this demonstration and would not normally occur; the block and the allow are real Sijil node decisions.");
});

test("the demo samples blueprints whose cases make model calls", () => {
  const profiles = profilesOf(SOP_ID)!;
  const flags = Object.fromEntries(profiles.flatMap((p) => p.tasks.map((t) => [t.id, { client_facing: t.flags.client_facing }])));
  const blueprints = deriveTests({ sopId: SOP_ID, profile: "Document Verification Analyst", chunks: loadSop(SOP_ID).chunks, flags });
  const cases = [...ALL_CASES, ...generatedCases(blueprints, ALL_CASES, "dv", true)];
  const ids = demoBlueprintIds(blueprints, cases, 4);
  assert.ok(ids.length > 0 && ids.length <= 4);
  // every sampled blueprint binds at least one ask or T12 case (a model call exists to screen)
  const plan = planPilot(blueprints, cases, "dv");
  const m = new Map(cases.map((c) => [c.id, c]));
  for (const id of ids) {
    assert.ok(plan.bound[id].some((cid) => { const c = m.get(cid); return !!c && (!!c.ask || c.task === "T12"); }), `${id} binds no model-calling case`);
  }
});
