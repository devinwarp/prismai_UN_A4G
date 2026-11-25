import { createHash, createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import type { CallDecision } from "./sijil-calls.ts";

// Pure request builders for sealing an agent run into a Sijil node (docs/sijil-wire-format.md). Sijil is a separate product; this file
// shares no code with it and only builds what its HTTP API takes. No I/O here: the client is sijil-agent-client.ts.
// Disclosure is CHECKED, never added: nothing in this file edits a deliverable's text.

/** The node's canonical JSON: sorted keys, no whitespace, non-ASCII kept as is. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(canonicalJson).join(",") + "]";
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + canonicalJson(o[k])).join(",") + "}";
  }
  return JSON.stringify(v);
}

export const sha256Hex = (s: string): string => createHash("sha256").update(s).digest("hex");

// ---- keys and proofs ------------------------------------------------------------------------------------------------------------
const PKCS8_ED25519_PREFIX = "302e020100300506032b657004220420";
const keyOf = (seedHex: string) => createPrivateKey({ key: Buffer.from(PKCS8_ED25519_PREFIX + seedHex, "hex"), format: "der", type: "pkcs8" });

/** A new agent key: the 32-byte Ed25519 seed as lower-case hex. Used by the one-time registration script only. */
export function newAgentKeyHex(): string {
  const { privateKey } = generateKeyPairSync("ed25519");
  return (privateKey.export({ format: "der", type: "pkcs8" }) as Buffer).subarray(-32).toString("hex");
}

/** The agent's public key as 32-byte lower-case hex (what the node registers). */
export function publicKeyHex(seedHex: string): string {
  const jwk = keyOf(seedHex).export({ format: "jwk" });
  return Buffer.from(jwk.x as string, "base64url").toString("hex");
}

export type ProofMessage = Record<string, string>;
export const sessionMessage = (a: { agent_id: string; node_id: string; nonce: string }): ProofMessage => ({ agent_id: a.agent_id, node_id: a.node_id, nonce: a.nonce, purpose: "session" });
export const registerMessage = (a: { agent_id: string; agent_pubkey: string; nonce: string; registered_by: string }): ProofMessage => ({ agent_id: a.agent_id, agent_pubkey: a.agent_pubkey, nonce: a.nonce, registered_by: a.registered_by });

/** Ed25519 over the 32 raw bytes of sha256(canonicalJson(msg)), as hex. */
export function signProof(seedHex: string, msg: ProofMessage): string {
  return sign(null, Buffer.from(sha256Hex(canonicalJson(msg)), "hex"), keyOf(seedHex)).toString("hex");
}

// ---- records ----------------------------------------------------------------------------------------------------------------------
export interface SealBody {
  type: "tool_call";
  rulepack_hash: "";
  decision: "allow" | "flag";
  mode: "record";
  input_hash: string;
  rule_hits: string[];
  ext: Record<string, unknown>;
}

const SERVER = "prism";
const baseExt = (tool: string, ctx: { sessionId: string }, summary: string): Record<string, unknown> => ({
  harness: "http-agent", session_id: ctx.sessionId, tool, server: SERVER, qualified: `${SERVER}.${tool}`, correlation: "none", observed_by: "mcp_guard", summary,
});

/** One tool call. Our own gate decides allow or reject; a reject is sealed as flag/record with a prism rule hit (the node's block/enforce is for
 * what the node itself enforces, i.e. halt). The record is sealed after the run, and the summary says so. */
export function callBody(c: CallDecision, ctx: { sessionId: string }): SealBody {
  const rejected = c.decision === "reject";
  return {
    type: "tool_call", rulepack_hash: "", decision: rejected ? "flag" : "allow", mode: "record",
    input_hash: sha256Hex(canonicalJson(c.call.args)),
    rule_hits: rejected ? [`prism:gate_rejected:${c.reason ?? "rejected"}`] : [],
    ext: baseExt(c.call.tool, ctx, "sealed by Prism after the run"),
  };
}

export const DELIVER_TOOL = "deliver_output";
export const DISCLOSURE_MISSING_HIT = "prism:ai_disclosure_missing";

/** The agent's deliverable, sealed as a call of a fixed tool name (Sijil has no deliverable record type): input_hash is the hash of the exact text.
 * null when the run produced no text. A client-facing deliverable without an AI disclosure (disclosed === false) is flagged with the missing-disclosure hit. */
export function deliverableBody(text: string | null, disclosed: boolean | null, ctx: { sessionId: string }): SealBody | null {
  if (text === null) return null;
  const missing = disclosed === false;
  return {
    type: "tool_call", rulepack_hash: "", decision: missing ? "flag" : "allow", mode: "record",
    input_hash: sha256Hex(text),
    rule_hits: missing ? [DISCLOSURE_MISSING_HIT] : [],
    ext: baseExt(DELIVER_TOOL, ctx, `ai-generated deliverable, sealed by Prism after the run; AI disclosure ${disclosed === true ? "present" : missing ? "MISSING" : "not applicable"}`),
  };
}

/** What counts as rejected: the node blocked it (halt), or our own gate had already rejected it. */
export function decisionFromSealed(sent: SealBody, sealed: { decision: string }): "allow" | "reject" {
  return sealed.decision === "block" || sent.rule_hits.some((h) => h.startsWith("prism:gate_rejected:")) ? "reject" : "allow";
}

/** The text of a client-facing message in a run's output (the email body), or null when there is none. */
export function deliverableText(output: unknown): string | null {
  const email = (output as { email?: { body?: unknown } | null } | null)?.email;
  return typeof email?.body === "string" && email.body.length > 0 ? email.body : null;
}
