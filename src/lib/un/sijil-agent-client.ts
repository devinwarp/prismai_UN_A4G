import { callBody, decisionFromSealed, deliverableBody, deliverableOf, sessionMessage, sha256Hex, signProof, type SealBody } from "./sijil-agent.ts";
import { checkCitizenMessage } from "./citizen-message.ts";
import { liveConfigFromEnv, type LiveConfig } from "./sijil-live.ts";
import type { PilotRun, SijilSeal } from "./pilot.ts";
import type { CaseOutcome } from "./task-evals.ts";

// Seals one pilot run into a Sijil node: one task per run, the agent's tool calls in order, then its deliverable. Sijil is a separate
// product; this file only calls its HTTP API. SERVER ONLY: it reads the agent key, which must never reach the browser or a log.
// Any failure falls back, for the WHOLE run, to the simulated gate's own decisions, with the reason: a run is never half sealed.

const TIMEOUT_MS = 5000;

export type AgentConfig = LiveConfig & { agentId: string; keyHex: string; agentToken: string };

/** null unless SIJIL_BASE_URL, SIJIL_AGENT_ID, SIJIL_AGENT_KEY (32-byte hex) and SIJIL_AGENT_TOKEN are all set. An invalid URL throws without the key. */
export function agentConfigFromEnv(env: Record<string, string | undefined> = process.env): AgentConfig | null {
  const base = liveConfigFromEnv(env);
  if (!base) return null;
  const agentId = env.SIJIL_AGENT_ID?.trim(), keyHex = env.SIJIL_AGENT_KEY?.trim(), agentToken = env.SIJIL_AGENT_TOKEN?.trim();
  if (!agentId || !keyHex || !agentToken || !/^[0-9a-f]{64}$/.test(keyHex)) return null;
  return { ...base, agentId, keyHex, agentToken };
}

/** Says what is wrong when SIJIL_BASE_URL is set but the agent settings are incomplete or invalid (the key's value is never echoed); null when fine or when no node is configured. */
export function configProblem(env: Record<string, string | undefined> = process.env): string | null {
  if (!env.SIJIL_BASE_URL?.trim()) return null;
  const missing = ["SIJIL_AGENT_ID", "SIJIL_AGENT_KEY", "SIJIL_AGENT_TOKEN"].filter((k) => !env[k]?.trim());
  if (missing.length) return `SIJIL_BASE_URL is set but ${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} missing`;
  if (!/^[0-9a-f]{64}$/.test(env.SIJIL_AGENT_KEY!.trim())) return "SIJIL_AGENT_KEY must be 64 lower-case hexadecimal characters";
  return null;
}

export type SealRun = (run: PilotRun, o: CaseOutcome) => Promise<SijilSeal>;

class SealError extends Error {
  status?: number;
  constructor(message: string, status?: number) { super(message); this.status = status; }
}

type Send = (method: "GET" | "POST", path: string, body?: unknown, session?: string) => Promise<Record<string, unknown>>;

function sender(cfg: AgentConfig, f: typeof fetch): Send {
  return async (method, path, body, session) => {
    let res: Response;
    try {
      res = await f(cfg.baseUrl + path, {
        method,
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(path.startsWith("/api/agent/") ? { "x-sijil-token": cfg.agentToken } : {}),
          ...(session ? { "x-sijil-agent-session": session } : {}),
          ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "error",
        cache: "no-store",
      });
    } catch (e) {
      throw new SealError(e instanceof Error && e.name === "TimeoutError" ? "Sijil node timed out" : "Sijil node unreachable");
    }
    const where = path.split("?")[0];
    if (!res.ok) throw new SealError(`Sijil node returned HTTP ${res.status} for ${where}`, res.status);
    try { return (await res.json()) as Record<string, unknown>; } catch { throw new SealError(`Sijil node returned invalid JSON for ${where}`); }
  };
}

interface Session { id: string; nodeId: string; rulepackHash: string }

async function handshake(cfg: AgentConfig, send: Send): Promise<Session> {
  const pol = await send("GET", "/api/policy");
  const nodeId = (pol.node_id ?? (pol.policy as { node_id?: unknown } | undefined)?.node_id) as unknown;
  if (typeof nodeId !== "string" || !nodeId) throw new SealError("Sijil node did not name itself");
  const ch = await send("POST", "/api/agent/challenge", { agent_id: cfg.agentId, purpose: "session" });
  const nonce = String(ch.nonce);
  const s = await send("POST", "/api/agent/session", { agent_id: cfg.agentId, nonce, proof: signProof(cfg.keyHex, sessionMessage({ agent_id: cfg.agentId, node_id: nodeId, nonce })) });
  if (typeof s.agent_session !== "string") throw new SealError("Sijil node returned no session");
  return { id: s.agent_session, nodeId, rulepackHash: await rulepackHashOf(send) };
}

/** The rule-pack hash in force on the node: its newest record carries it ("" when the node has no rule pack). A seal must carry exactly this hash
 * or the node answers 409 "rulepack mismatch". Two small reads, once per session. */
async function rulepackHashOf(send: Send): Promise<string> {
  const head = await send("GET", "/api/records?since=1000000000");
  const total = Number(head.total);
  if (!Number.isFinite(total) || total < 1) return "";
  const last = (await send("GET", `/api/records?since=${total - 1}`)).records as { rulepack_hash?: unknown }[] | undefined;
  const h = last?.[last.length - 1]?.rulepack_hash;
  return typeof h === "string" ? h : "";
}

const simulatedRejected = (o: CaseOutcome) => o.calls.filter((c) => c.decision === "reject").length;

/** The seal function for one pilot (it keeps one session across the runs of that pilot). */
export function createSealer(cfg: AgentConfig, f: typeof fetch = fetch): SealRun {
  const send = sender(cfg, f);
  let session: Session | null = null;

  async function attempt(run: PilotRun, o: CaseOutcome, s: Session): Promise<SijilSeal> {
    let taskSeq: number | undefined;
    try {
      const start = await send("POST", "/api/agent/task/start", { intent_hash: sha256Hex(`${run.test_id}#${run.rep}`), harness: "http-agent", session_id: s.id.slice(0, 8) }, s.id);
      taskSeq = Number(start.seq);
      const ctx = { sessionId: `pilot-${run.test_id}` };
      const decisions: string[] = [];
      let rejected = 0;
      for (const c of o.calls) {
        const body: SealBody = callBody(c, ctx);
        const r = await send("POST", "/api/agent/seal", { ...body, rulepack_hash: s.rulepackHash, task_seq: taskSeq }, s.id);
        decisions.push(String(r.decision));
        if (decisionFromSealed(body, { decision: String(r.decision) }) === "reject") rejected++;
      }
      const made = deliverableOf(o.result as { output?: unknown; refused?: unknown });
      // a drafted message is checked for an AI disclosure here when the pilot did not (only client-facing tests are); the run record is not changed
      const disclosed = made?.kind === "message" ? (run.disclosed ?? checkCitizenMessage(made.text, "en").checks.find((c) => c.id === "ai_disclosure")!.ok) : null;
      const d = made ? deliverableBody(made.text, disclosed, ctx, made.kind) : null;
      let deliverable: { seq: number; hash: string; decision: string } | undefined;
      if (d) {
        const r = await send("POST", "/api/agent/seal", { ...d, rulepack_hash: s.rulepackHash, task_seq: taskSeq }, s.id);
        decisions.push(String(r.decision));
        deliverable = { seq: Number(r.seq), hash: d.input_hash, decision: String(r.decision) };
      }
      await send("POST", "/api/agent/task/end", { outcome: "completed", task_seq: taskSeq }, s.id);
      return {
        source: `node:${s.nodeId}`, sealed: decisions.length, calls_rejected: rejected,
        halted: decisions.length > 0 && decisions.every((x) => x === "block"),
        task_seq: taskSeq,
        ...(deliverable ? { deliverable_seq: deliverable.seq, deliverable_hash: deliverable.hash, deliverable_decision: deliverable.decision } : {}),
      };
    } catch (e) {
      if (taskSeq !== undefined) await send("POST", "/api/agent/task/end", { outcome: "error", task_seq: taskSeq }, s.id).catch(() => undefined);
      throw e;
    }
  }

  // circuit breaker: once the node is unreachable (no HTTP answer), or three runs in a row fell back, the rest of the pilot goes straight to the
  // simulated gate. Without it a frozen node would cost a full timeout on every remaining run.
  let dead: string | null = null, streak = 0;
  const fallback = (o: CaseOutcome, reason: string): SijilSeal => ({ source: "simulated:unreachable", sealed: 0, calls_rejected: simulatedRejected(o), reason });

  return async (run, o) => {
    if (dead) return fallback(o, dead);
    try {
      for (let tries = 0; ; tries++) {
        session ??= await handshake(cfg, send);
        try { const out = await attempt(run, o, session); streak = 0; return out; } catch (e) {
          if (e instanceof SealError && e.status === 401 && tries === 0) { session = null; continue; }
          throw e;
        }
      }
    } catch (e) {
      session = null;
      const reason = e instanceof SealError ? e.message : "Sijil sealing failed";
      streak++;
      if ((e instanceof SealError && e.status === undefined) || streak >= 3) dead = reason;
      return fallback(o, reason);
    }
  };
}

/** The node's own verification of its chain. Asks for orphan-tolerant verification (our agent's model calls do not go through the node, so its tool
 * calls have no parent model-call record); a node that cannot do that reports ok:false with its reason. */
export async function verifyChain(cfg: AgentConfig, f: typeof fetch = fetch): Promise<{ ok: boolean; reason?: string; orphan?: true }> {
  try {
    const v = await sender(cfg, f)("GET", "/api/verify?allow_orphan_tool_calls=1");
    if (v.ok === true) return { ok: true };
    const output = String(v.output ?? "verification failed");
    // the node's strict verifier stops at the first tool call that has no recorded model call behind it (ours never do): say so, not "tampered"
    return { ok: false, reason: output.slice(0, 160), ...(/without parent inference/i.test(output) ? { orphan: true as const } : {}) };
  } catch (e) {
    return { ok: false, reason: e instanceof SealError ? e.message : "verification failed" };
  }
}
