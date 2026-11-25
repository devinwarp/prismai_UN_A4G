import assert from "node:assert/strict";
import test from "node:test";
import { agentConfigFromEnv, createSealer, verifyChain, type AgentConfig } from "../src/lib/un/sijil-agent-client.ts";
import { newAgentKeyHex, sha256Hex } from "../src/lib/un/sijil-agent.ts";
import type { PilotRun } from "../src/lib/un/pilot.ts";
import type { CaseOutcome } from "../src/lib/un/task-evals.ts";
import type { CallDecision } from "../src/lib/un/sijil-calls.ts";

const KEY = newAgentKeyHex();
const cfg: AgentConfig = { baseUrl: "https://sijil.example", agentId: "spiffe://prism/agent/pilot", keyHex: KEY, agentToken: "tok-secret-123" };
const run = { test_id: "t01#c1", rep: 1 } as PilotRun;
const call = (tool: string, decision: "allow" | "reject" = "allow"): CallDecision => ({ call: { tool, args: { a: 1 } }, decision, ...(decision === "reject" ? { reason: "tool_not_authorised" as const } : {}) });
const outcome = (calls: CallDecision[], body?: string): CaseOutcome => ({ calls, result: { output: body === undefined ? { status: "ok" } : { email: { body } } } } as unknown as CaseOutcome);

interface Seen { method: string; path: string; body: Record<string, unknown> | null; headers: Record<string, string> }
function node(opts: { halted?: boolean; failSealAt?: number; sessionStatusOnce?: number; sealStatus401Times?: number; down?: boolean; verify?: unknown } = {}) {
  const seen: Seen[] = [];
  let seq = 10, seals = 0, s401 = opts.sealStatus401Times ?? 0, sessions = 0;
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    if (opts.down) throw new TypeError("fetch failed");
    const u = new URL(String(url));
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    seen.push({ method: init?.method ?? "GET", path: u.pathname + u.search, body, headers });
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
    switch (u.pathname) {
      case "/api/policy": return json({ node_id: "node-a" });
      case "/api/agent/challenge": return json({ nonce: "ab".repeat(32) });
      case "/api/agent/session": sessions++; return json({ agent_session: `as_${sessions}`, expires_at: "x" });
      case "/api/agent/task/start": return json({ seq: ++seq, record_hash: "h" });
      case "/api/agent/seal": {
        seals++;
        if (s401 > 0) { s401--; return json({ detail: "agent session unknown or expired" }, 401); }
        if (opts.failSealAt === seals) return json({ detail: "boom" }, 409);
        return json({ seq: ++seq, record_hash: "h", decision: opts.halted ? "block" : (body as { decision: string }).decision });
      }
      case "/api/agent/task/end": return json({ seq: ++seq, record_hash: "h" });
      case "/api/verify": return json(opts.verify ?? { ok: true, exit_code: 0, output: "PASS records=3" });
    }
    return json({}, 404);
  }) as typeof fetch;
  return { f, seen, paths: () => seen.map((s) => s.path), count: (p: string) => seen.filter((s) => s.path === p).length };
}

test("seals each call then the deliverable, in order, inside one task, and returns the sealed counts", async () => {
  const n = node();
  const out = await createSealer(cfg, n.f)(run, outcome([call("lookup"), call("send_customer_message", "reject")], "This was drafted by an AI assistant."));
  assert.deepEqual(n.paths().filter((p) => p.startsWith("/api/agent/task") || p === "/api/agent/seal"), ["/api/agent/task/start", "/api/agent/seal", "/api/agent/seal", "/api/agent/seal", "/api/agent/task/end"]);
  assert.equal(out.source, "node:node-a");
  assert.equal(out.sealed, 3);
  assert.equal(out.calls_rejected, 1);
  assert.equal(out.deliverable_hash, sha256Hex("This was drafted by an AI assistant."));
  assert.equal(out.deliverable_decision, "allow");
  assert.equal(typeof out.task_seq, "number");
  assert.equal(out.halted, false);
  const tools = n.seen.filter((s) => s.path === "/api/agent/seal").map((s) => (s.body!.ext as { tool: string }).tool);
  assert.deepEqual(tools, ["lookup", "send_customer_message", "deliver_output"]);
});

test("a run with no deliverable text seals the calls and ends the task, with no deliverable record", async () => {
  const n = node();
  const out = await createSealer(cfg, n.f)(run, outcome([call("lookup")]));
  assert.equal(n.count("/api/agent/seal"), 1);
  assert.equal(n.count("/api/agent/task/end"), 1);
  assert.equal(out.deliverable_seq, undefined);
  assert.equal(out.deliverable_hash, undefined);
});

test("a client-facing deliverable with no AI disclosure is sealed flagged with the missing-disclosure rule hit", async () => {
  const n = node();
  const r = { ...run, disclosed: false } as PilotRun;
  const out = await createSealer(cfg, n.f)(r, outcome([call("lookup")], "Dear applicant, your licence is approved."));
  const last = n.seen.filter((s) => s.path === "/api/agent/seal").pop()!;
  assert.deepEqual(last.body!.rule_hits, ["prism:ai_disclosure_missing"]);
  assert.equal(out.deliverable_decision, "flag");
});

test("one session is reused across two runs (a single challenge and session request)", async () => {
  const n = node();
  const seal = createSealer(cfg, n.f);
  await seal(run, outcome([call("a")]));
  await seal(run, outcome([call("b")]));
  assert.equal(n.count("/api/agent/challenge"), 1);
  assert.equal(n.count("/api/agent/session"), 1);
  assert.equal(n.count("/api/agent/task/start"), 2);
});

test("every agent request carries the agent token and, after the handshake, the session header", async () => {
  const n = node();
  await createSealer(cfg, n.f)(run, outcome([call("a")]));
  const agentCalls = n.seen.filter((s) => s.path.startsWith("/api/agent/"));
  assert.ok(agentCalls.every((s) => s.headers["x-sijil-token"] === "tok-secret-123"));
  assert.ok(n.seen.filter((s) => /task|seal/.test(s.path)).every((s) => s.headers["x-sijil-agent-session"] === "as_1"));
});

test("a 401 on a seal triggers one re-handshake and the run completes", async () => {
  const n = node({ sealStatus401Times: 1 });
  const out = await createSealer(cfg, n.f)(run, outcome([call("a")]));
  assert.equal(n.count("/api/agent/session"), 2);
  assert.equal(out.source, "node:node-a");
});

test("a second 401 falls back", async () => {
  const n = node({ sealStatus401Times: 2 });
  const out = await createSealer(cfg, n.f)(run, outcome([call("a")]));
  assert.equal(out.source, "simulated:unreachable");
});

test("a failed seal halfway falls back for the whole run, keeps the simulated rejected count, gives a reason, and still ends the task", async () => {
  const n = node({ failSealAt: 2 });
  const out = await createSealer(cfg, n.f)(run, outcome([call("a"), call("b", "reject"), call("c")], "hi"));
  assert.equal(out.source, "simulated:unreachable");
  assert.equal(out.sealed, 0);
  assert.equal(out.calls_rejected, 1);
  assert.match(String(out.reason), /409/);
  assert.equal(n.count("/api/agent/task/end"), 1);
});

test("an unreachable node falls back without throwing", async () => {
  const out = await createSealer(cfg, node({ down: true }).f)(run, outcome([call("a", "reject")]));
  assert.equal(out.source, "simulated:unreachable");
  assert.equal(out.calls_rejected, 1);
});

test("a halted node (every seal blocked) returns halted true and counts every call as rejected", async () => {
  const out = await createSealer(cfg, node({ halted: true }).f)(run, outcome([call("a"), call("b")], "hi"));
  assert.equal(out.halted, true);
  assert.equal(out.calls_rejected, 2);
  assert.equal(out.deliverable_decision, "block");
});

test("the returned seal and any error text never contain the key, the agent token or the session id", async () => {
  for (const o of [{}, { failSealAt: 1 }, { down: true }]) {
    const out = await createSealer(cfg, node(o).f)(run, outcome([call("a")], "hi"));
    const text = JSON.stringify(out);
    assert.ok(!text.includes(KEY) && !text.includes("tok-secret-123") && !text.includes("as_1"), text);
  }
});

test("agentConfigFromEnv returns null when any of the four variables is missing, and an invalid URL error never echoes the key", () => {
  const full = { SIJIL_BASE_URL: "https://sijil.example", SIJIL_AGENT_ID: "spiffe://prism/agent/pilot", SIJIL_AGENT_KEY: KEY, SIJIL_AGENT_TOKEN: "t" };
  assert.ok(agentConfigFromEnv(full));
  for (const k of Object.keys(full)) assert.equal(agentConfigFromEnv({ ...full, [k]: undefined }), null, k);
  assert.equal(agentConfigFromEnv({ ...full, SIJIL_AGENT_KEY: "not-hex" }), null);
  assert.throws(() => agentConfigFromEnv({ ...full, SIJIL_BASE_URL: "ftp://x" }), (e: Error) => !e.message.includes(KEY));
});

test("verifyChain asks for orphan-tolerant verification and reports ok", async () => {
  const n = node();
  assert.deepEqual(await verifyChain(cfg, n.f), { ok: true });
  assert.ok(n.paths().some((p) => p.startsWith("/api/verify?") && p.includes("allow_orphan_tool_calls=1")));
});

test("verifyChain reports a node that cannot verify orphan calls as not ok, with the reason, and an unreachable node as not ok", async () => {
  const bad = node({ verify: { ok: false, exit_code: 1, output: "FAIL seq=3 tool_call without parent inference" } });
  const r = await verifyChain(cfg, bad.f);
  assert.equal(r.ok, false);
  assert.match(String(r.reason), /parent inference/);
  assert.equal((await verifyChain(cfg, node({ down: true }).f)).ok, false);
});
