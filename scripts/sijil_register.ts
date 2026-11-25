// One-time: registers this app's agent with a Sijil node and prints the two lines to put in .env.local. Run by a person who holds the
// node's admin token; the app itself never reads that token. The key is printed once and not stored anywhere else.
//   SIJIL_BASE_URL=http://127.0.0.1:8000 SIJIL_AGENT_TOKEN=<node agent token> SIJIL_ADMIN_TOKEN=<node admin token> \
//     node scripts/sijil_register.ts [agent-name]
import { newAgentKeyHex, publicKeyHex, registerMessage, sha256Hex, signProof } from "../src/lib/un/sijil-agent.ts";

const base = (process.env.SIJIL_BASE_URL ?? "").replace(/\/+$/, "");
const agentToken = process.env.SIJIL_AGENT_TOKEN ?? "";
const admin = process.env.SIJIL_ADMIN_TOKEN ?? "";
if (!base || !agentToken || !admin) { console.error("set SIJIL_BASE_URL, SIJIL_AGENT_TOKEN and SIJIL_ADMIN_TOKEN"); process.exit(2); }

const name = (process.argv[2] ?? "pilot").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
const agentId = `spiffe://prism/agent/${name}`;
const keyHex = newAgentKeyHex();
const pub = publicKeyHex(keyHex);
const registeredBy = "local:" + sha256Hex("prism-operator");

async function post(path: string, body: unknown, extra: Record<string, string> = {}) {
  const res = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json", "x-sijil-token": agentToken, ...extra }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path} returned HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return (await res.json()) as Record<string, unknown>;
}

const ch = await post("/api/agent/challenge", { agent_id: agentId, purpose: "register" });
await post("/api/agent/register", { agent_id: agentId, agent_pubkey: pub, nonce: ch.nonce, registered_by: registeredBy, self_proof: signProof(keyHex, registerMessage({ agent_id: agentId, agent_pubkey: pub, nonce: String(ch.nonce), registered_by: registeredBy })) }, { authorization: `Bearer ${admin}` });

console.error(`Registered ${agentId}. Put these in .env.local (server only), with SIJIL_BASE_URL and SIJIL_AGENT_TOKEN:`);
console.log(`SIJIL_AGENT_ID=${agentId}`);
console.log(`SIJIL_AGENT_KEY=${keyHex}`);
