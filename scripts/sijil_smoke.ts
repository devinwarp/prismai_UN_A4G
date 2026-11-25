// Manual integration check against a local Sijil node (see docs/sijil-wire-format.md). It registers a throwaway agent, seals one
// tool call and one deliverable record inside a task, ends the task and verifies the chain. With --halt it halts the node first
// and expects every record to seal "block". Secrets come from the environment and are never printed.
//   SIJIL_BASE=http://127.0.0.1:8077 SIJIL_TOKEN=... SIJIL_ADMIN_TOKEN=... node scripts/sijil_smoke.ts [--halt]
import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";

const BASE = (process.env.SIJIL_BASE ?? "http://127.0.0.1:8077").replace(/\/+$/, "");
const TOKEN = process.env.SIJIL_TOKEN ?? "";
const ADMIN = process.env.SIJIL_ADMIN_TOKEN ?? "";
if (!TOKEN || !ADMIN) { console.error("set SIJIL_TOKEN and SIJIL_ADMIN_TOKEN"); process.exit(2); }

const canon = (v: unknown): string => {
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v as object).sort().map((k) => JSON.stringify(k) + ":" + canon((v as Record<string, unknown>)[k])).join(",") + "}";
  return JSON.stringify(v);
};
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const proof = (key: KeyObject, msg: object) => sign(null, Buffer.from(sha(canon(msg)), "hex"), key).toString("hex");

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: unknown = null; try { json = JSON.parse(text); } catch { /* not json */ }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  return json as Record<string, unknown>;
}

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const pubHex = Buffer.from(publicKey.export({ format: "jwk" }).x as string, "base64url").toString("hex");
const agentId = `spiffe://prism/agent/smoke-${Date.now()}`;
const registeredBy = "local:" + sha("prism-smoke-operator");
const tok = { "x-sijil-token": TOKEN };

const policy = await call("GET", "/api/policy");
const nodeId = (policy.node_id ?? (policy.policy as Record<string, unknown> | undefined)?.node_id) as string;

let ch = await call("POST", "/api/agent/challenge", { agent_id: agentId, purpose: "register" }, tok);
await call("POST", "/api/agent/register", { agent_id: agentId, agent_pubkey: pubHex, nonce: ch.nonce, registered_by: registeredBy,
  self_proof: proof(privateKey, { agent_id: agentId, agent_pubkey: pubHex, nonce: ch.nonce, registered_by: registeredBy }) }, { ...tok, authorization: `Bearer ${ADMIN}` });
ch = await call("POST", "/api/agent/challenge", { agent_id: agentId, purpose: "session" }, tok);
const sess = await call("POST", "/api/agent/session", { agent_id: agentId, nonce: ch.nonce,
  proof: proof(privateKey, { agent_id: agentId, node_id: nodeId, nonce: ch.nonce, purpose: "session" }) }, tok);
const sh = { ...tok, "x-sijil-agent-session": sess.agent_session as string };

if (process.argv.includes("--halt")) await call("POST", "/api/admin/halt", { halted: true }, { authorization: `Bearer ${ADMIN}` });

const start = await call("POST", "/api/agent/task/start", { intent_hash: sha("smoke test#1"), harness: "http-agent", session_id: "smoke" }, sh);
const ext = (tool: string) => ({ harness: "http-agent", session_id: "smoke", tool, server: "prism", qualified: `prism.${tool}`, correlation: "none", observed_by: "mcp_guard" });
const text = "Dear applicant, this message was drafted by an AI assistant. A person will release it.";
const a = await call("POST", "/api/agent/seal", { type: "tool_call", rulepack_hash: "", decision: "allow", mode: "record", input_hash: sha(canon({ licence: "L-1" })), rule_hits: [], ext: ext("lookup_licence") }, sh);
const d = await call("POST", "/api/agent/seal", { type: "tool_call", rulepack_hash: "", decision: "allow", mode: "record", input_hash: sha(text), rule_hits: [], ext: { ...ext("deliver_output"), summary: "ai-generated deliverable; AI disclosure present" } }, sh);
const m = await call("POST", "/api/agent/seal", { type: "tool_call", rulepack_hash: "", decision: "flag", mode: "record", input_hash: sha("no disclosure"), rule_hits: ["prism:ai_disclosure_missing"], ext: { ...ext("deliver_output"), summary: "ai-generated deliverable; AI disclosure MISSING" } }, sh);
const end = await call("POST", "/api/agent/task/end", { outcome: "completed", task_seq: start.seq }, sh);
const v = await call("GET", "/api/verify");

console.log(JSON.stringify({ halted: process.argv.includes("--halt"), task_start: start.seq, call: a.decision, deliverable_ok: d.decision, deliverable_missing_disclosure: m.decision, task_end: end, verify: v }, null, 1));
if (process.argv.includes("--halt")) await call("POST", "/api/admin/halt", { halted: false }, { authorization: `Bearer ${ADMIN}` });
