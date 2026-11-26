import { CHAT_MODEL, chatCompletion, parseLlmJson, SijilBlockedError } from "../llm.ts";
import { agentLlmEndpoint } from "./agent-llm.ts";
import { ruleReasoner, type Action, type Reflection, type Reflector, type ReactState, type Reasoner } from "./react-sop.ts";

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
- search_sop {"query": string, "kind"?: string}: search the SOP. kind narrows to one kind of passage: required-documents, fees, decision-rule, escalation, role, task, faq.
- request_outside_information {"question": string, "reason": string}: use this when the SOP does not support an answer.
- finish {"citations": [chunk ids]}: only when a retrieved passage you were shown states the answer. Cite only ids you were shown as retrieved.
You may not approve, reject, issue, send or change anything; those are not tools. Never answer from your own knowledge.

How to decide, in this order:
1. List what the question asks for: the thing itself AND every specific condition in it (a place, a person, an amount, a time limit, a kind of licence). An answer must cover all of them.
2. Search in the SOP's own words (for example "permit" -> "licence", "papers" -> "documents", "tenancy" -> "lease"). If a search finds nothing useful, rewrite the query and narrow it with kind; do not repeat a query.
3. A passage SUPPORTS an answer only if one of its sentences states the answer to THIS question, conditions included. Words the question shares with a passage ("licence", "renew", "trade", "applicant", "fee") prove nothing. A passage that says what the procedure is for, or what a task takes as input, does not answer a question about something the passage never mentions.
4. If, after three searches worded differently, no passage states the answer, call request_outside_information. This is the right answer to a question about another city or authority, a tax or another law, opening hours or phone numbers, or a named person (the SOP names roles, not people). Do not stretch a loosely related passage to fit.
5. Finish only when a retrieved passage states the answer (a table row that gives the figure asked for counts), and in "thought" copy the text that does. A reviewer will then ask you to quote it, and a quote that is not word for word in the passage is refused.
The program accepts a finish only if every cited id is on the list "checked as supporting the question". If the passage you need was retrieved but is not on that list, search again using words copied from that passage.

Examples (shortened).
Question: which documents do I need to renew -> search_sop {"query": "documents required renewal", "kind": "required-documents"} -> a passage lists the required documents -> finish with its id, and quote the sentence listing them.
Question: can I renew in another city instead -> search_sop "renew another city" -> passages only describe renewal at this authority; none mentions another city -> search_sop with other words -> still nothing -> request_outside_information (the SOP says nothing about other cities).
Question: who is the head of licensing by name -> the SOP names roles, not people -> request_outside_information.

Reply with one JSON object only, in exactly this shape (the key is "tool", not "name"):
{"thought": "...", "action": {"tool": "search_sop", "query": "..."}}
{"thought": "...", "action": {"tool": "request_outside_information", "question": "...", "reason": "..."}}
{"thought": "...", "action": {"tool": "finish", "citations": ["SOP-LIC-014#D4"]}}`;

/** The reflection step: a second look at the question and the cited passages only, after the reasoner proposes to finish. */
export const REFLECT_SYSTEM = `You review ONE proposed answer from a retrieval agent over a standard operating procedure. You are shown the question and the passages the agent cited. Decide whether the text of a passage states the answer to THIS question, including every condition the question names (a place, a person, an amount, a time, a kind of licence). A passage may be a table: a row or a cell of a table that gives the figure asked for DOES state the answer.
Shared topic words ("licence", "renew", "trade", "applicant", "fee") are not an answer. A passage that only says what the procedure is for, or what a task takes as input, does not answer a question about something that passage never mentions (another city, another law, a person's name, opening hours). Be strict about that: when the asked-for thing is absent, "answers" is false.
Quote the text that states the answer, copied word for word: a sentence, or a table row or cells. Do not paraphrase. You may skip words in the middle with "..." but every fragment must be exact.
Reply with one JSON object only: {"answers": true or false, "quote": "<the exact text, or an empty string>", "why": "<one short sentence>"}`;

const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n) + "..." : t);

export function promptFor(s: ReactState): string {
  const hist = s.steps.map((x, i) => `${i + 1}. thought: ${clip(x.thought, 200)}\n   action: ${JSON.stringify(x.action)}\n   observation: ${clip(x.observation, 300)}`).join("\n");
  const list = s.enumerated?.length ? s.enumerated.map((id) => s.retrieved.get(id)).filter((c): c is NonNullable<typeof c> => !!c) : [];
  const listed = new Set(list.map((c) => c.chunk_id));
  const shown = [...list, ...[...s.retrieved.values()].filter((c) => !listed.has(c.chunk_id)).slice(-4)].map((c) => `[${c.chunk_id}] ${clip(c.text.split("\n").slice(1).join(" "), 380)}`).join("\n");
  const sup = [...s.supported.keys()];
  const note = list.length ? `\n\nThe question asks for a LIST. The SOP keeps one passage per item, so the program has gathered every item passage (${list.map((c) => c.chunk_id.split("#")[1]).join(", ")}) and shows all of them below. Together they ARE the answer: finish now, citing any of them, and quote the text of one item in your thought. Do not search for a passage you can already see.` : "";
  return `Question: ${s.question}${note}\n\nSteps so far:\n${hist || "(none)"}\n\nPassages retrieved so far:\n${shown || "(none)"}\n\nPassages the program has checked as supporting the question: ${sup.length ? sup.join(", ") : "none yet"}\nNext action as JSON.`;
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

export interface LlmReasonerOptions { model?: string; chat?: ChatFn; fallback?: Reasoner; /** replaces SYSTEM, to compare prompts */ system?: string }

/** Build the reasoner. `chat` is injectable for tests; by default it calls src/lib/llm.ts (any
 * OpenAI-compatible endpoint: OpenRouter, or LM Studio through LLM_BASE_URL). A failed call or an
 * unparsable reply falls back to the rule-based step, and is counted in `usage.fallbacks`. */
export function llmReasoner(o: LlmReasonerOptions = {}): LlmReasoner {
  const model = o.model ?? (process.env.AGENT_LLM_MODEL || CHAT_MODEL);
  const usage: LlmUsage = { calls: 0, fallbacks: 0, prompt_tokens: 0, completion_tokens: 0, cost: 0 };
  const fallback = o.fallback ?? ruleReasoner;
  const chat: ChatFn = o.chat ?? (({ system, user }) => {
    // AGENT_LLM_BASE_URL routes the call through the Sijil node, which
    // screens the exact prompt before inference; a block throws
    // SijilBlockedError and must never fall back to the rule reasoner.
    const ep = agentLlmEndpoint();
    return chatCompletion({
      system, messages: [{ role: "user", content: user }], maxTokens: 700, timeoutMs: 60_000, seed: 7,
      ...(process.env.AGENT_LLM_MODEL ? { model: process.env.AGENT_LLM_MODEL } : {}),
      ...(ep ? { baseUrl: ep.baseUrl, apiKey: ep.apiKey } : {}),
      onUsage: (u) => { usage.prompt_tokens += u?.prompt_tokens ?? 0; usage.completion_tokens += u?.completion_tokens ?? 0; usage.cost += u?.cost ?? 0; },
    });
  });
  const reasoner: Reasoner = async (s) => {
    usage.calls++;
    try { return parseStep(await chat({ system: o.system ?? SYSTEM, user: promptFor(s) })); }
    catch (e) { if (e instanceof SijilBlockedError) throw e; usage.fallbacks++; return fallback(s); }
  };
  return { reasoner, usage, model };
}

export function reflectPrompt(question: string, passages: { chunk_id: string; text: string }[], opts: { list?: boolean } = {}): string {
  const list = opts.list ? `\nThe question asks for a LIST. The program gathered every item passage of the list: each cited passage is ONE item of it. Answer true if the items are what the question asks for, and quote the exact text of any ONE item (not a summary of all of them).\n` : "";
  return `Question: ${question}\n${list}\nCited passages:\n${passages.map((p) => `[${p.chunk_id}] ${clip(p.text.replace(/\s+/g, " "), 1200)}`).join("\n")}\n\nReply as JSON.`;
}

/** Parse a reflection reply. An unreadable reply is "does not answer": a failed review never lets a finish through. */
export function parseReflection(text: string): Reflection {
  try {
    const o = parseLlmJson(text) as { answers?: unknown; quote?: unknown; why?: unknown };
    return { answers: o?.answers === true, quote: typeof o?.quote === "string" ? o.quote : "", why: typeof o?.why === "string" ? o.why.slice(0, 200) : "" };
  } catch { return { answers: false, quote: "", why: "the reflection reply could not be read" }; }
}

export interface ReflectUsage { calls: number; said_no: number; errors: number; prompt_tokens: number; completion_tokens: number }
export interface LlmReflector { reflect: Reflector; usage: ReflectUsage; model: string }

/** The reflector. Its model is REFLECT_LLM_MODEL when set (a stronger or a different model reviews the answer), else the agent's.
 * `chat` is injectable for tests. A failed call throws: the loop treats that as a refused finish. */
export function llmReflector(o: { model?: string; chat?: ChatFn } = {}): LlmReflector {
  const model = o.model ?? (process.env.REFLECT_LLM_MODEL || process.env.AGENT_LLM_MODEL || CHAT_MODEL);
  const usage: ReflectUsage = { calls: 0, said_no: 0, errors: 0, prompt_tokens: 0, completion_tokens: 0 };
  const chat: ChatFn = o.chat ?? (({ system, user }) => {
    const ep = agentLlmEndpoint();
    return chatCompletion({
      system, messages: [{ role: "user", content: user }], maxTokens: 1500, timeoutMs: 60_000, model, json: true,
      ...(ep ? { baseUrl: ep.baseUrl, apiKey: ep.apiKey } : {}),
      onUsage: (u) => { usage.prompt_tokens += u?.prompt_tokens ?? 0; usage.completion_tokens += u?.completion_tokens ?? 0; },
    });
  });
  const reflect: Reflector = async (question, passages, opts) => {
    usage.calls++;
    try {
      const r = parseReflection(await chat({ system: REFLECT_SYSTEM, user: reflectPrompt(question, passages, opts) }));
      if (!r.answers) usage.said_no++;
      return r;
    } catch (e) { usage.errors++; throw e; }
  };
  return { reflect, usage, model };
}

/** AGENT_REASONER=llm selects the model reasoner, if an endpoint is configured; anything else, or no
 * key and no custom endpoint, keeps the deterministic one (so offline runs never wait on a network). */
export function reasonerFromEnv(env: Record<string, string | undefined> = process.env): Reasoner | undefined {
  if (env.AGENT_REASONER !== "llm") return undefined;
  if (!env.LLM_BASE_URL && !env.LLM_API_KEY && !env.OPENROUTER_API_KEY) return undefined;
  return llmReasoner().reasoner;
}
