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
  /** Multi-turn conversation id: caches the system prompt and history
   * across turns and keeps the conversation on one provider. */
  conversationId?: string;
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

async function postChat(body: Record<string, unknown>, timeoutMs?: number) {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs ?? 45_000),
    headers: {
      Authorization: `Bearer ${process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
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

export async function chatCompletion(opts: ChatRequestOpts): Promise<string> {
  const data = await postChat(requestBody(opts), opts.timeoutMs);
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
  const data = await postChat(body, opts.timeoutMs);
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
