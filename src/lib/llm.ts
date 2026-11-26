import { recordModelCall } from "./un/cost.ts";

// Any OpenAI-compatible endpoint works — set LLM_BASE_URL (e.g. a DDA or
// in-country gateway) to move every model call off OpenRouter.
const OPENROUTER_URL = `${(process.env.LLM_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "")}/chat/completions`;

export const CHAT_MODEL =
  process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-5.5";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatRequestOpts {
  system?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  timeoutMs?: number;
  /** Ask the provider for a syntactically valid JSON object (JSON mode). */
  json?: boolean;
  /** Override CHAT_MODEL for this call. */
  model?: string;
  /** Repeatable sampling: temperature 0 + this seed. Best effort —
   * OpenRouter drops params a model doesn't support (Sonnet takes
   * neither; reasoning models ignore temperature), so code-computed
   * numbers and prompt anchors carry run-to-run stability, not this. */
  seed?: number;
  /** Send this call to another OpenAI-compatible base URL instead of
   * LLM_BASE_URL — the Sijil node's /v1 endpoint screens the exact
   * prompt before inference. `apiKey` is sent as the Bearer token when
   * set; the Bedrock branch is skipped for a per-call override. */
  baseUrl?: string;
  apiKey?: string;
  /** Multi-turn conversation id: caches the system prompt and history
   * across turns and keeps the conversation on one provider. */
  conversationId?: string;
  /** Receives the provider `usage` block (token counts) when one is returned. */
  onUsage?: (usage: { prompt_tokens?: number; completion_tokens?: number; cost?: number } | undefined) => void;
}

// Anthropic caches only up to an explicit breakpoint (5-min TTL, refreshed on
// each hit): reads cost 0.05× input, writes 1.25×. One on the system prompt,
// one on the last history message — only the new message goes uncached, and
// the next turn reads everything this one wrote.
function cached(m: ChatMessage) {
  return {
    role: m.role,
    content: [
      { type: "text", text: m.content, cache_control: { type: "ephemeral" } },
    ],
  };
}

function requestBody(opts: ChatRequestOpts): Record<string, unknown> {
  const cache = opts.conversationId ? cached : (m: ChatMessage) => m;
  const n = opts.messages.length;
  return {
    model: opts.model ?? CHAT_MODEL,
    max_tokens: opts.maxTokens ?? 1024,
    messages: [
      ...(opts.system ? [cache({ role: "system", content: opts.system })] : []),
      ...opts.messages.map((m, i) => (i === n - 2 ? cache(m) : m)),
    ],
    ...(opts.conversationId ? { session_id: opts.conversationId } : {}),
    // Newer models think before answering, and those hidden tokens count
    // against max_tokens — at default effort a big JSON reply got cut off
    // mid-object. Low effort keeps thinking small; every call here is
    // structured extraction or chat, not hard reasoning.
    reasoning: { effort: "low" },
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    ...(opts.seed !== undefined ? { temperature: 0, seed: opts.seed } : {}),
  };
}

// Amazon Bedrock's native Converse API. Claude is not served on Bedrock's OpenAI-compatible endpoints, only here,
// with the same Bedrock API key as a Bearer token. Selected when LLM_BASE_URL is a bedrock-runtime host without the
// /openai path (for example https://bedrock-runtime.eu-central-1.amazonaws.com) or LLM_PROVIDER=bedrock. The model
// is then a Bedrock id or inference profile (eu.anthropic.claude-sonnet-5-5).
const isBedrock = () => process.env.LLM_PROVIDER === "bedrock" || (/^https:\/\/bedrock-runtime\./.test(process.env.LLM_BASE_URL ?? "") && !/\/openai(\/|$)/.test(process.env.LLM_BASE_URL ?? ""));

/** The Converse request for an OpenAI-style chat request. System messages move to `system`; consecutive turns of one
 * role are merged, because Converse needs strictly alternating turns that start with the user. */
export function converseBody(body: Record<string, unknown>): Record<string, unknown> {
  const msgs = (body.messages as ChatMessage[]) ?? [];
  const system = msgs.filter((m) => m.role === "system").map((m) => ({ text: m.content }));
  if (body.response_format) system.push({ text: "Reply with one valid JSON object and nothing else: no prose, no code fence." });
  const turns: { role: "user" | "assistant"; content: { text: string }[] }[] = [];
  for (const m of msgs) {
    if (m.role === "system") continue;
    const last = turns[turns.length - 1];
    if (last && last.role === m.role) last.content.push({ text: m.content });
    else turns.push({ role: m.role, content: [{ text: m.content }] });
  }
  return {
    ...(system.length ? { system } : {}),
    messages: turns,
    inferenceConfig: { maxTokens: body.max_tokens, ...(body.temperature !== undefined ? { temperature: body.temperature } : {}) },
  };
}

/** The reply in the OpenAI shape the rest of this file reads: the text blocks joined, and the token counts. */
export function converseReply(data: { output?: { message?: { content?: { text?: string }[] } }; usage?: { inputTokens?: number; outputTokens?: number } }) {
  const text = (data.output?.message?.content ?? []).map((b) => b.text ?? "").join("");
  return { choices: [{ message: { content: text } }], usage: { prompt_tokens: data.usage?.inputTokens, completion_tokens: data.usage?.outputTokens } };
}

/** The Sijil node refused the prompt before inference: HTTP 403 with
 * `{"sijill":{"seq","decision":"block","rule_hits":[...]}}`. Distinct
 * from an auth 403 (LlmHttpError) — callers must surface it, never
 * fall back. `rules` are the matched policy rule ids, `seq` the node's
 * record sequence number (its audit trail). */
export class SijilBlockedError extends Error {
  readonly rules: string[];
  readonly seq: number;
  readonly recordHash?: string;
  constructor(rules: string[], seq: number, recordHash?: string) {
    super(`Sijil blocked the prompt before inference (seq ${seq}): ${rules.join(", ") || "policy"}`);
    this.name = "SijilBlockedError";
    this.rules = rules;
    this.seq = seq;
    this.recordHash = recordHash;
  }
}

interface ChatEndpoint { baseUrl: string; apiKey?: string }

/** A node policy block arrives as 403 + a `sijill.decision === "block"`
 * body — parse it into SijilBlockedError. Anything else returns null so
 * the caller raises the usual LlmHttpError. */
async function sijilBlock(res: Response): Promise<SijilBlockedError | null> {
  if (res.status !== 403) return null;
  let j: unknown;
  try { j = await res.clone().json(); } catch { return null; }
  const s = (j as { sijill?: { seq?: unknown; decision?: unknown; rule_hits?: unknown; record_hash?: unknown } } | null)?.sijill;
  if (!s || s.decision !== "block") return null;
  const hits = Array.isArray(s.rule_hits) ? s.rule_hits : [];
  const rules = hits.map((h) => {
    if (typeof h === "string") return h;
    if (h && typeof h === "object") {
      const o = h as { id?: unknown; rule?: unknown; rule_id?: unknown };
      return String(o.id ?? o.rule ?? o.rule_id ?? "");
    }
    return "";
  }).filter(Boolean);
  return new SijilBlockedError(rules, typeof s.seq === "number" ? s.seq : 0,
    typeof s.record_hash === "string" ? s.record_hash : undefined);
}

async function postChat(body: Record<string, unknown>, timeoutMs?: number, endpoint?: ChatEndpoint) {
  if (!endpoint && isBedrock()) {
    if (body.tools) throw new Error("The web-search tool is not available on Bedrock");
    const base = (process.env.LLM_BASE_URL ?? "").replace(/\/+$/, "");
    const call = (b: Record<string, unknown>) => fetch(`${base}/model/${encodeURIComponent(String(b.model))}/converse`, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs ?? 45_000),
      headers: { Authorization: `Bearer ${process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(converseBody(b)),
    });
    let res = await call(body);
    // some newer models (Claude Opus 5.5) refuse a temperature: say so with a 400. Repeatable sampling is best effort
    // anyway (see `seed`), so ask again without it rather than fail the whole call.
    if (res.status === 400 && body.temperature !== undefined) {
      const text = await res.text();
      if (!/temperature/i.test(text)) throw new LlmHttpError(400, text);
      const { temperature: _t, ...rest } = body;
      void _t;
      res = await call(rest);
    }
    if (!res.ok) throw new LlmHttpError(res.status, await res.text());
    return converseReply(await res.json());
  }
  const res = await fetch(endpoint ? `${endpoint.baseUrl.replace(/\/+$/, "")}/chat/completions` : OPENROUTER_URL, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs ?? 45_000),
    headers: {
      ...(endpoint?.apiKey || !endpoint
        ? { Authorization: `Bearer ${endpoint?.apiKey ?? process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY}` }
        : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const blocked = await sijilBlock(res);
    if (blocked) throw blocked;
    throw new LlmHttpError(res.status, await res.text());
  }
  return res.json();
}

/** A non-2xx reply from OpenRouter. `fatal` = billing/auth (401/402/403) —
 * retrying can't help until someone fixes the account. */
export class LlmHttpError extends Error {
  readonly status: number;
  constructor(status: number, body: string) {
    super(`OpenRouter ${status}: ${body}`);
    this.status = status;
  }
  get fatal() {
    return this.status === 401 || this.status === 402 || this.status === 403;
  }
}

/** Count one model call for the cost ledger (un/cost.ts): the tokens the provider reported (0 when it did not, or the call failed), and a
 * cost the provider reported itself, if it did. A failed call is counted too: it was attempted, and may have been billed. */
function meter(model: string, usage: { prompt_tokens?: number; completion_tokens?: number; cost?: number } | undefined) {
  recordModelCall(model, usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0, typeof usage?.cost === "number" ? usage.cost : null);
}

export async function chatCompletion(opts: ChatRequestOpts): Promise<string> {
  const model = opts.model ?? CHAT_MODEL;
  const endpoint = opts.baseUrl ? { baseUrl: opts.baseUrl, apiKey: opts.apiKey } : undefined;
  let data;
  try { data = await postChat(requestBody(opts), opts.timeoutMs, endpoint); } catch (e) { meter(model, undefined); throw e; }
  meter(model, data.usage);
  opts.onUsage?.(data.usage);
  return data.choices?.[0]?.message?.content ?? "";
}

export interface Citation {
  url: string;
  title?: string;
  content?: string;
}

/**
 * chatCompletion plus OpenRouter's `openrouter:web_search` server tool (the
 * deprecated `web` plugin and `:online` model suffix must NOT be used).
 * The tool is agentic — the model decides when/how often to search, and
 * searches are billed per query — so callers must pass a long timeoutMs
 * (≥120 s) and a prompt that explicitly instructs research.
 *
 * Citations arrive as `url_citation` entries in `message.annotations`;
 * they are never invented — no/empty annotations → an empty array.
 */
export async function chatCompletionWithCitations(opts: {
  system?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  timeoutMs?: number;
  model?: string;
  web?: { engine?: string; maxResults?: number; maxTotalResults?: number };
}): Promise<{ text: string; citations: Citation[] }> {
  const { web, ...req } = opts;
  const body = requestBody(req);
  if (web) {
    body.tools = [
      {
        type: "openrouter:web_search",
        parameters: {
          engine: web.engine ?? "auto",
          max_results: web.maxResults ?? 5,
          max_total_results: web.maxTotalResults ?? 20,
        },
      },
    ];
  }
  const model = opts.model ?? CHAT_MODEL;
  let data;
  try { data = await postChat(body, opts.timeoutMs); } catch (e) { meter(model, undefined); throw e; }
  meter(model, data.usage);
  const message = data.choices?.[0]?.message;
  const content = message?.content;
  return {
    text:
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content
              .map((p: unknown) =>
                p && typeof p === "object" && "text" in p
                  ? String((p as { text: unknown }).text)
                  : "",
              )
              .join("")
          : "",
    citations: citationsOf(message?.annotations),
  };
}

// Only `url_citation` annotations carrying a real url survive — anything
// else (other annotation types, missing url, no annotations) is ignored.
function citationsOf(annotations: unknown): Citation[] {
  if (!Array.isArray(annotations)) return [];
  const out: Citation[] = [];
  for (const a of annotations) {
    const c =
      a && typeof a === "object" && (a as { type?: unknown }).type === "url_citation"
        ? (a as { url_citation?: unknown }).url_citation
        : null;
    if (c && typeof c === "object") {
      const u = c as { url?: unknown; title?: unknown; content?: unknown };
      if (typeof u.url === "string" && u.url) {
        out.push({
          url: u.url,
          ...(typeof u.title === "string" ? { title: u.title } : {}),
          ...(typeof u.content === "string" ? { content: u.content } : {}),
        });
      }
    }
  }
  return out;
}

/** Parse JSON out of a model reply that may wrap it in a ```json fence and/or
 * append commentary ("**Reasoning:** …") before or after it. */
export function parseLlmJson(text: string): unknown {
  const body = text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? text;
  const start = body.search(/[{[]/);
  const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
  return JSON.parse(body.slice(start, end + 1));
}
