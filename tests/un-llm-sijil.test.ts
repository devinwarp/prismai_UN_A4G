import assert from "node:assert/strict";
import test from "node:test";
import { chatCompletion, LlmHttpError, SijilBlockedError } from "../src/lib/llm.ts";
import { agentLlmEndpoint } from "../src/lib/un/agent-llm.ts";
import { SijilLiveError } from "../src/lib/un/sijil-live.ts";

/** Stub fetch for one call; returns what the stub produced. */
async function withFetch<T>(fn: (seen: { url: string; auth: string | null; body: unknown }[]) => Response | Promise<Response>, run: () => Promise<T>): Promise<{ out: T; seen: { url: string; auth: string | null; body: unknown }[] }> {
  const saved = globalThis.fetch;
  const seen: { url: string; auth: string | null; body: unknown }[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), auth: new Headers(init?.headers).get("authorization"), body: init?.body ? JSON.parse(String(init.body)) : null });
    return fn(seen);
  }) as typeof fetch;
  try { return { out: await run(), seen }; } finally { globalThis.fetch = saved; }
}

const okReply = () => new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }], usage: {} }), { status: 200 });

test("baseUrl routes the call to <base>/chat/completions with the given apiKey", async () => {
  const { out, seen } = await withFetch(() => okReply(), () =>
    chatCompletion({ messages: [{ role: "user", content: "hi" }], baseUrl: "http://localhost:8077/v1/", apiKey: "node-key" }));
  assert.equal(out, "ok");
  assert.equal(seen[0].url, "http://localhost:8077/v1/chat/completions");
  assert.equal(seen[0].auth, "Bearer node-key");
});

test("a Sijil 403 block throws SijilBlockedError with the rule ids and seq, not LlmHttpError", async () => {
  const block = () => new Response(JSON.stringify({
    error: { type: "policy_block", code: "sijill_block" },
    sijill: { seq: 7, decision: "block", rule_hits: ["agent_to_agent"], record_hash: "abc" },
  }), { status: 403 });
  const err = await withFetch(block, () => chatCompletion({ messages: [{ role: "user", content: "hi" }], baseUrl: "http://x/v1" })).then(() => null, (e) => e);
  assert.ok(err instanceof SijilBlockedError);
  assert.deepEqual(err.rules, ["agent_to_agent"]);
  assert.equal(err.seq, 7);
  assert.equal(err.recordHash, "abc");
  assert.ok(!(err instanceof LlmHttpError));
});

test("rule_hits entries shaped {id} or {rule} normalise to strings", async () => {
  const block = () => new Response(JSON.stringify({ sijill: { seq: 3, decision: "block", rule_hits: [{ id: "prompt_override" }, { rule: "agent_to_agent" }, 42] } }), { status: 403 });
  const err = await withFetch(block, () => chatCompletion({ messages: [{ role: "user", content: "hi" }], baseUrl: "http://x/v1" })).then(() => null, (e) => e);
  assert.ok(err instanceof SijilBlockedError);
  assert.deepEqual(err.rules, ["prompt_override", "agent_to_agent"]);
});

test("a plain 403 without the sijill shape still throws LlmHttpError", async () => {
  const forbidden = () => new Response(JSON.stringify({ error: { message: "no" } }), { status: 403 });
  const err = await withFetch(forbidden, () => chatCompletion({ messages: [{ role: "user", content: "hi" }], baseUrl: "http://x/v1" })).then(() => null, (e) => e);
  assert.ok(err instanceof LlmHttpError);
  assert.equal(err.status, 403);
});

test("agentLlmEndpoint: null when unset, parsed URL+key when set, throws on invalid without echoing the key", () => {
  assert.equal(agentLlmEndpoint({}), null);
  assert.equal(agentLlmEndpoint({ AGENT_LLM_BASE_URL: "  " }), null);
  const ep = agentLlmEndpoint({ AGENT_LLM_BASE_URL: "https://node.example/v1/", AGENT_LLM_API_KEY: "k" });
  assert.deepEqual(ep, { baseUrl: "https://node.example/v1", apiKey: "k" });
  assert.equal(agentLlmEndpoint({ AGENT_LLM_BASE_URL: "https://node.example/v1" })!.apiKey, undefined);
  assert.throws(() => agentLlmEndpoint({ AGENT_LLM_BASE_URL: "ftp://x", AGENT_LLM_API_KEY: "secret-key" }), SijilLiveError);
  try { agentLlmEndpoint({ AGENT_LLM_BASE_URL: "notaurl", AGENT_LLM_API_KEY: "secret-key" }); assert.fail("should throw"); }
  catch (e) { assert.ok(!(e as Error).message.includes("secret-key")); }
});
