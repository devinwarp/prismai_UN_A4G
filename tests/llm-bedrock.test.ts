import assert from "node:assert/strict";
import test from "node:test";
import { chatCompletion, converseBody, converseReply } from "../src/lib/llm.ts";

test("converseBody moves system messages to system and merges consecutive turns", () => {
  const b = converseBody({
    max_tokens: 500,
    messages: [{ role: "system", content: "be brief" }, { role: "user", content: "a" }, { role: "user", content: "b" }, { role: "assistant", content: "c" }, { role: "user", content: "d" }],
  }) as { system: { text: string }[]; messages: { role: string; content: { text: string }[] }[]; inferenceConfig: { maxTokens: number } };
  assert.deepEqual(b.system, [{ text: "be brief" }]);
  assert.deepEqual(b.messages.map((m) => [m.role, m.content.map((c) => c.text)]), [["user", ["a", "b"]], ["assistant", ["c"]], ["user", ["d"]]]);
  assert.equal(b.inferenceConfig.maxTokens, 500);
});

test("converseBody asks for bare JSON in json mode and passes temperature", () => {
  const b = converseBody({ max_tokens: 10, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "user", content: "x" }] }) as { system: { text: string }[]; inferenceConfig: { temperature: number } };
  assert.match(b.system[0].text, /JSON object/);
  assert.equal(b.inferenceConfig.temperature, 0);
});

test("converseReply joins the text blocks and maps the token counts", () => {
  const r = converseReply({ output: { message: { content: [{ text: "o" }, { text: "k" }] } }, usage: { inputTokens: 7, outputTokens: 2 } });
  assert.equal(r.choices[0].message.content, "ok");
  assert.deepEqual(r.usage, { prompt_tokens: 7, completion_tokens: 2 });
});

test("a bedrock-runtime base URL calls Converse with the encoded model id and a Bearer key", async () => {
  const saved = { url: process.env.LLM_BASE_URL, key: process.env.LLM_API_KEY, fetch: globalThis.fetch };
  process.env.LLM_BASE_URL = "https://bedrock-runtime.eu-central-1.amazonaws.com";
  process.env.LLM_API_KEY = "k";
  let seen: { url: string; auth: string | null } | null = null;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    seen = { url: String(url), auth: new Headers(init?.headers).get("authorization") };
    return new Response(JSON.stringify({ output: { message: { content: [{ text: "ok" }] } }, usage: { inputTokens: 1, outputTokens: 1 } }), { status: 200 });
  }) as typeof fetch;
  try {
    const out = await chatCompletion({ messages: [{ role: "user", content: "hi" }], model: "eu.anthropic.claude-sonnet-4-5-20250929-v1:0" });
    assert.equal(out, "ok");
    assert.equal(seen!.url, "https://bedrock-runtime.eu-central-1.amazonaws.com/model/eu.anthropic.claude-sonnet-4-5-20250929-v1%3A0/converse");
    assert.equal(seen!.auth, "Bearer k");
  } finally {
    globalThis.fetch = saved.fetch;
    if (saved.url === undefined) delete process.env.LLM_BASE_URL; else process.env.LLM_BASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = saved.key;
  }
});

test("a 400 that refuses temperature is retried once without it", async () => {
  const saved = { url: process.env.LLM_BASE_URL, key: process.env.LLM_API_KEY, fetch: globalThis.fetch };
  process.env.LLM_BASE_URL = "https://bedrock-runtime.eu-central-1.amazonaws.com";
  process.env.LLM_API_KEY = "k";
  const sent: unknown[] = [];
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const b = JSON.parse(String(init?.body)) as { inferenceConfig: { temperature?: number } };
    sent.push(b.inferenceConfig.temperature);
    return b.inferenceConfig.temperature !== undefined
      ? new Response(JSON.stringify({ message: "`temperature` is deprecated for this model." }), { status: 400 })
      : new Response(JSON.stringify({ output: { message: { content: [{ text: "ok" }] } } }), { status: 200 });
  }) as typeof fetch;
  try {
    assert.equal(await chatCompletion({ messages: [{ role: "user", content: "hi" }], model: "m", seed: 1 }), "ok");
    assert.deepEqual(sent, [0, undefined]);
  } finally {
    globalThis.fetch = saved.fetch;
    if (saved.url === undefined) delete process.env.LLM_BASE_URL; else process.env.LLM_BASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = saved.key;
  }
});

test("any other 400 is not retried", async () => {
  const saved = { url: process.env.LLM_BASE_URL, key: process.env.LLM_API_KEY, fetch: globalThis.fetch };
  process.env.LLM_BASE_URL = "https://bedrock-runtime.eu-central-1.amazonaws.com";
  process.env.LLM_API_KEY = "k";
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response(JSON.stringify({ message: "bad model id" }), { status: 400 }); }) as typeof fetch;
  try {
    await assert.rejects(chatCompletion({ messages: [{ role: "user", content: "hi" }], model: "m", seed: 1 }), /bad model id/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = saved.fetch;
    if (saved.url === undefined) delete process.env.LLM_BASE_URL; else process.env.LLM_BASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = saved.key;
  }
});
