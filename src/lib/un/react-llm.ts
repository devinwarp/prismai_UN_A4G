import { CHAT_MODEL, chatCompletion, parseLlmJson } from "../llm.ts";
import { ruleReasoner, type Action, type ReactState, type Reasoner } from "./react-sop.ts";

// A language-model reasoner for the ReAct loop in react-sop.ts. It only proposes the next thought and
// action. It cannot end the loop: the loop checks every action against the tool list, accepts a finish
// only with a citation it has checked itself, and makes the required outside-information call when the
// model finishes uncited, names an unknown tool, errors or runs out of steps. So a bad model costs
// accuracy, never a control. The rule-based reasoner stays the default and the offline fallback.

export type ChatFn = (o: { system: string; user: string }) => Promise<string>;

export interface LlmUsage { calls: number; fallbacks: number; prompt_tokens: number; completion_tokens: number; cost: number }
export interface LlmReasoner { reasoner: Reasoner; usage: LlmUsage; model: string }

export const SYSTEM = `You are the reasoning step of a retrieval agent for ONE standard operating procedure (SOP). You do not answer questions yourself. You choose the next action, and a program checks it.
Tools:
- search_sop {"query": string, "kind"?: string}: search the SOP. Rewrite the query in the SOP's own words (for example "permit" -> "licence", "papers" -> "documents"). kind narrows to one kind of passage: required-documents, fees, decision-rule, escalation, role, task, faq.
- request_outside_information {"question": string, "reason": string}: use this when the SOP does not support an answer. The SOP names roles, not people, and says nothing about taxes, other cities, opening hours or phone numbers unless a passage says so.
- finish {"citations": [chunk ids]}: only when a retrieved passage you were shown states the answer. Cite only ids you were shown as retrieved.
Never answer from your own knowledge. If three searches found nothing that states the answer, request outside information. You may not approve, reject, issue, send or change anything; those are not tools.
The program accepts a finish only if every cited id is on the list "checked as supporting the question". If the passage you need was retrieved but is not on that list, search again using words copied from that passage.
Reply with one JSON object only, in exactly this shape (the key is "tool", not "name"):
{"thought": "...", "action": {"tool": "search_sop", "query": "..."}}
{"thought": "...", "action": {"tool": "request_outside_information", "question": "...", "reason": "..."}}
{"thought": "...", "action": {"tool": "finish", "citations": ["SOP-LIC-014#D4"]}}`;

const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n) + "..." : t);

export function promptFor(s: ReactState): string {
  const hist = s.steps.map((x, i) => `${i + 1}. thought: ${clip(x.thought, 200)}\n   action: ${JSON.stringify(x.action)}\n   observation: ${clip(x.observation, 300)}`).join("\n");
  const shown = [...s.retrieved.values()].slice(-6).map((c) => `[${c.chunk_id}] ${clip(c.text.split("\n").slice(1).join(" "), 380)}`).join("\n");
  const sup = [...s.supported.keys()];
  return `Question: ${s.question}\n\nSteps so far:\n${hist || "(none)"}\n\nPassages retrieved so far:\n${shown || "(none)"}\n\nPassages the program has checked as supporting the question: ${sup.length ? sup.join(", ") : "none yet"}\nNext action as JSON.`;
}

export function parseStep(text: string): { thought: string; action: Action } {
  const o = parseLlmJson(text) as { thought?: unknown; action?: unknown };
  if (!o || typeof o !== "object" || !o.action) throw new Error("no action in the reply");
  // some models answer in function-call style ({"name": ..., "arguments": {...}}); translate, the loop still validates
  const a = o.action as Record<string, unknown>;
  const args = (a && typeof a === "object" && typeof a.arguments === "object" && a.arguments ? a.arguments : {}) as Record<string, unknown>;
  const action = typeof a === "string" ? { tool: a } : a.tool === undefined && (a.name ?? a.action) !== undefined ? { ...a, ...args, tool: a.name ?? a.action } : a;
  return { thought: typeof o.thought === "string" ? o.thought : "", action: action as Action };
}

export interface LlmReasonerOptions { model?: string; chat?: ChatFn; fallback?: Reasoner }

/** Build the reasoner. `chat` is injectable for tests; by default it calls src/lib/llm.ts (any
 * OpenAI-compatible endpoint: OpenRouter, or LM Studio through LLM_BASE_URL). A failed call or an
 * unparsable reply falls back to the rule-based step, and is counted in `usage.fallbacks`. */
export function llmReasoner(o: LlmReasonerOptions = {}): LlmReasoner {
  const model = o.model ?? (process.env.AGENT_LLM_MODEL || CHAT_MODEL);
  const usage: LlmUsage = { calls: 0, fallbacks: 0, prompt_tokens: 0, completion_tokens: 0, cost: 0 };
  const fallback = o.fallback ?? ruleReasoner;
  const chat: ChatFn = o.chat ?? (({ system, user }) => chatCompletion({
    system, messages: [{ role: "user", content: user }], maxTokens: 700, timeoutMs: 60_000, seed: 7,
    ...(process.env.AGENT_LLM_MODEL ? { model: process.env.AGENT_LLM_MODEL } : {}),
    onUsage: (u) => { usage.prompt_tokens += u?.prompt_tokens ?? 0; usage.completion_tokens += u?.completion_tokens ?? 0; usage.cost += u?.cost ?? 0; },
  }));
  const reasoner: Reasoner = async (s) => {
    usage.calls++;
    try { return parseStep(await chat({ system: SYSTEM, user: promptFor(s) })); }
    catch { usage.fallbacks++; return fallback(s); }
  };
  return { reasoner, usage, model };
}

/** AGENT_REASONER=llm selects the model reasoner, if an endpoint is configured; anything else, or no
 * key and no custom endpoint, keeps the deterministic one (so offline runs never wait on a network). */
export function reasonerFromEnv(env: Record<string, string | undefined> = process.env): Reasoner | undefined {
  if (env.AGENT_REASONER !== "llm") return undefined;
  if (!env.LLM_BASE_URL && !env.LLM_API_KEY && !env.OPENROUTER_API_KEY) return undefined;
  return llmReasoner().reasoner;
}
