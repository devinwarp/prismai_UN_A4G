import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { consultPrompt, modelAvailable, modelConsultDraft, parseConsultDraft, type ConsultFacts } from "../src/lib/un/consult-draft.ts";

const facts: ConsultFacts = { subject: "Process targets proposed for UC02", body: "The owner proposed targets.", entity: "Marsa Public Services Authority", use_case: "UC02", summary: "Cycle time under 5 days.", step: "Process targets" };
const GOOD = "Thanks for asking. I have read the proposed targets for UC02. Please confirm whether the five-day cycle time is realistic for the licensing team. [your view here]";

test("the prompt carries the request and the context but no personal details", () => {
  const p = consultPrompt({ ...facts });
  assert.match(p, /UC02/);
  assert.match(p, /Marsa Public Services Authority/);
  assert.match(p, /Cycle time under 5 days/);
  assert.doesNotMatch(p, /@/);
  assert.deepEqual(Object.keys(facts).sort(), ["body", "entity", "step", "subject", "summary", "use_case"], "the facts hold no user fields");
});

test("a usable model reply becomes a draft that says it is a draft", async () => {
  const out = await modelConsultDraft(facts, async () => JSON.stringify({ body: GOOD }));
  assert.ok(out);
  assert.ok(out.text.startsWith(GOOD));
  assert.match(out.text, /not sent until you send it/);
});

test("an empty, too short, or approving reply, or a failed call, gives no draft so the rule-based one is used", async () => {
  assert.equal(parseConsultDraft(JSON.stringify({ body: "ok" })), null);
  assert.equal(parseConsultDraft(JSON.stringify({ body: "I hereby approve the targets for UC02 and sign them on behalf of the owner." })), null);
  assert.equal(await modelConsultDraft(facts, async () => ""), null);
  assert.equal(await modelConsultDraft(facts, async () => { throw new Error("down"); }), null);
});

test("a reply that is plain text instead of JSON is still taken", () => {
  assert.equal(parseConsultDraft(GOOD), GOOD);
});

test("the model is not called offline, switched off, or without a key", () => {
  assert.equal(modelAvailable({ OFFLINE: "1", LLM_API_KEY: "k" }), false);
  assert.equal(modelAvailable({ CONSULT_DRAFT_MODEL: "off", LLM_API_KEY: "k" }), false);
  assert.equal(modelAvailable({}), false);
  assert.equal(modelAvailable({ LLM_API_KEY: "k" }), true);
});

test("the agent uses the model draft for a consult, falls back to rules, and logs which one wrote it", () => {
  const src = readFileSync("src/lib/un/inbox-service.ts", "utf8");
  assert.match(src, /modelAvailable\(\) \? await modelConsultDraft\(facts\) : null/);
  assert.match(src, /written\?\.text \?\? draftConsult\(i\)/);
  assert.match(src, /by: written \? "model" : "rules"/);
});
