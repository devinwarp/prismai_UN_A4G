import assert from "node:assert/strict";
import test from "node:test";
import { createHash, createPublicKey, verify as edVerify } from "node:crypto";
import {
  callBody, canonicalJson, decisionFromSealed, deliverableBody, deliverableOf, deliverableText, newAgentKeyHex, publicKeyHex, registerMessage, sessionMessage, sha256Hex, signProof,
} from "../src/lib/un/sijil-agent.ts";
import type { CallDecision } from "../src/lib/un/sijil-calls.ts";

const ctx = { sessionId: "pilot-1" };
const allow: CallDecision = { call: { tool: "lookup_licence", args: { licence: "L-1", flag: true } }, decision: "allow" };
const reject: CallDecision = { call: { tool: "send_customer_message", args: { to: "x" } }, decision: "reject", reason: "human_release_missing" };

test("canonicalJson sorts keys and has no whitespace", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [2, "x"], c: null } }), '{"a":{"c":null,"d":[2,"x"]},"b":1}');
});

test("signProof verifies with the matching public key, over sha256 of the canonical message", () => {
  const key = newAgentKeyHex();
  const msg = sessionMessage({ agent_id: "spiffe://prism/agent/a", node_id: "n1", nonce: "ab" });
  const sig = signProof(key, msg);
  const spki = Buffer.from("302a300506032b6570032100" + publicKeyHex(key), "hex");
  const pub = createPublicKey({ key: spki, format: "der", type: "spki" });
  assert.equal(edVerify(null, Buffer.from(createHash("sha256").update(canonicalJson(msg)).digest("hex"), "hex"), pub, Buffer.from(sig, "hex")), true);
});

test("signProof of a different message does not verify", () => {
  const key = newAgentKeyHex();
  const sig = signProof(key, sessionMessage({ agent_id: "a", node_id: "n1", nonce: "ab" }));
  const spki = Buffer.from("302a300506032b6570032100" + publicKeyHex(key), "hex");
  const pub = createPublicKey({ key: spki, format: "der", type: "spki" });
  const other = Buffer.from(sha256Hex(canonicalJson(sessionMessage({ agent_id: "a", node_id: "n1", nonce: "cd" }))), "hex");
  assert.equal(edVerify(null, other, pub, Buffer.from(sig, "hex")), false);
});

test("the session and register messages have exactly the fields the node signs", () => {
  assert.deepEqual(Object.keys(sessionMessage({ agent_id: "a", node_id: "n", nonce: "x" })).sort(), ["agent_id", "node_id", "nonce", "purpose"]);
  assert.equal(sessionMessage({ agent_id: "a", node_id: "n", nonce: "x" }).purpose, "session");
  assert.deepEqual(Object.keys(registerMessage({ agent_id: "a", agent_pubkey: "p", nonce: "x", registered_by: "local:r" })).sort(), ["agent_id", "agent_pubkey", "nonce", "registered_by"]);
});

test("callBody records an allowed call with the hash of its args, correlation none and no after_the_fact flag", () => {
  const b = callBody(allow, ctx);
  assert.equal(b.type, "tool_call");
  assert.equal(b.decision, "allow");
  assert.equal(b.mode, "record");
  assert.equal(b.rulepack_hash, "");
  assert.equal(b.input_hash, sha256Hex(canonicalJson(allow.call.args)));
  assert.equal(b.ext.tool, "lookup_licence");
  assert.equal(b.ext.correlation, "none");
  assert.equal(b.ext.observed_by, "mcp_guard");
  assert.equal(b.ext.harness, "http-agent");
  assert.equal(b.ext.session_id, "pilot-1");
  assert.equal("after_the_fact" in b.ext, false);
});

test("callBody seals a call our own gate rejected as flag/record with a prism rule hit, never block/enforce", () => {
  const b = callBody(reject, ctx);
  assert.equal(b.decision, "flag");
  assert.equal(b.mode, "record");
  assert.deepEqual(b.rule_hits, ["prism:gate_rejected:human_release_missing"]);
});

test("deliverableBody for text with a disclosure is allow, hashes the exact text and marks it AI-generated in the summary", () => {
  const text = "This reply was drafted by an AI assistant.";
  const b = deliverableBody(text, true, ctx)!;
  assert.equal(b.decision, "allow");
  assert.equal(b.input_hash, sha256Hex(text));
  assert.equal(b.ext.tool, "deliver_output");
  assert.match(String(b.ext.summary), /ai-generated/i);
  assert.deepEqual(b.rule_hits, []);
});

test("deliverableBody with disclosed false is flag/record with the missing-disclosure rule hit", () => {
  const b = deliverableBody("Dear applicant, your licence is approved.", false, ctx)!;
  assert.equal(b.decision, "flag");
  assert.equal(b.mode, "record");
  assert.deepEqual(b.rule_hits, ["prism:ai_disclosure_missing"]);
});

test("an internal deliverable without a disclosure is flagged", () => {
  const b = deliverableBody("internal note", null, ctx)!;
  assert.equal(b.decision, "flag");
  assert.deepEqual(b.rule_hits, ["prism:ai_disclosure_missing"]);
});

test("deliverableBody for null text returns null", () => {
  assert.equal(deliverableBody(null, null, ctx), null);
});

test("decisionFromSealed: a node block is a reject; our gate's own reject stays a reject; allow and flag from the node are allow", () => {
  assert.equal(decisionFromSealed(callBody(allow, ctx), { decision: "block" }), "reject");
  assert.equal(decisionFromSealed(callBody(allow, ctx), { decision: "allow" }), "allow");
  assert.equal(decisionFromSealed(callBody(allow, ctx), { decision: "flag" }), "allow");
  assert.equal(decisionFromSealed(callBody(reject, ctx), { decision: "flag" }), "reject");
});

test("deliverableText returns the email body, and null for output with no email", () => {
  assert.equal(deliverableText({ email: { to: "a@b", body: "hello" } }), "hello");
  assert.equal(deliverableText({ email: null }), null);
  assert.equal(deliverableText({ status: "ok" }), null);
  assert.equal(deliverableText(null), null);
  assert.equal(deliverableText({ email: { body: "" } }), null);
});

test("a structured decision requires explicit AI provenance", () => {
  const b = deliverableBody('{"ai_disclosure":"Generated by an AI assistant.","status":"ok"}', null, ctx, "decision")!;
  assert.equal(b.decision, "allow");
  assert.deepEqual(b.rule_hits, []);
  assert.match(String(b.ext.summary), /structured decision/);
  assert.match(String(b.ext.summary), /disclosure present/);
  assert.equal(deliverableBody('{"status":"ok"}', null, ctx, "decision")!.decision, "flag");
});

test("deliverableOf: a message when there is an email body, a structured decision for other output, nothing for a refusal or no output", () => {
  assert.deepEqual(deliverableOf({ output: { email: { body: "hi" } } }), { text: "hi", kind: "message" });
  assert.deepEqual(deliverableOf({ output: { b: 1, a: [2] } }), { text: '{"a":[2],"b":1}', kind: "decision" });
  assert.equal(deliverableOf({ output: { status: "x" }, refused: true }), null);
  assert.equal(deliverableOf({ output: { status: "outside_kb" } }), null);
  assert.equal(deliverableOf({ output: null }), null);
  assert.equal(deliverableOf({}), null);
});
