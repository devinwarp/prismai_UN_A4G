import { chatCompletion, CHAT_MODEL, parseLlmJson } from "../llm.ts";
import { agentLlmEndpoint } from "./agent-llm.ts";

// The model-written draft of a consulted item's reply. A person is asked for their input; their agent drafts the reply from the item and its context,
// and the person reads, edits and sends it. The model only WRITES the draft: it never sends, decides or approves anything, and it is told not to
// take a position it was not given. It sees the item's subject, text, entity and use case, and no names, emails or other personal details. If the model
// is not available (offline, no key, a failed or empty call) the rule-based draft is used, so a consult never waits on a model.

export interface ConsultFacts {
  subject: string;
  body: string;
  entity: string | null;
  use_case: string | null;
  /** a short summary the event attached, if any */
  summary: string | null;
  /** what the step is called, e.g. "Process targets" */
  step: string | null;
}

export const CONSULT_SYSTEM = [
  "You draft a short reply for a person who was asked for their input on a step of an AI use-case approval process.",
  "Write in the first person as that person, in plain professional English, 60 to 140 words.",
  "Use only the facts you are given. Do not invent figures, dates, names or commitments, and do not approve, reject or sign anything: you only draft input.",
  "Where the person must give their own view, say what they should confirm or add in one or two concrete questions, and leave a clear [your view here] marker.",
  'Answer with JSON: {"body": "<the draft>"}.',
].join(" ");

export function consultPrompt(f: ConsultFacts): string {
  return [
    `Step: ${f.step ?? "not stated"}`,
    f.entity ? `Entity: ${f.entity}` : null,
    f.use_case ? `Use case: ${f.use_case}` : null,
    `Request: ${f.subject}`,
    `Details: ${f.summary ?? f.body}`,
  ].filter(Boolean).join("\n");
}

/** The draft the model wrote, or null when it wrote nothing usable. A draft that approves or signs on the person's behalf is refused. */
export function parseConsultDraft(reply: string): string | null {
  let text = "";
  try {
    const o = parseLlmJson(reply) as { body?: unknown };
    if (o && typeof o.body === "string") text = o.body;
  } catch { text = reply; }
  text = text.trim();
  if (text.length < 20 || text.length > 2000) return null;
  if (/\b(i hereby (approve|sign|reject)|approved and signed|signed on behalf)\b/i.test(text)) return null;
  return text;
}

type Chat = (a: { system: string; user: string }) => Promise<string>;

const defaultChat: Chat = ({ system, user }) => {
  const ep = agentLlmEndpoint();
  return chatCompletion({
    system, messages: [{ role: "user", content: user }], maxTokens: 500, timeoutMs: 30_000, json: true,
    model: process.env.AGENT_LLM_MODEL || CHAT_MODEL,
    ...(ep ? { baseUrl: ep.baseUrl, apiKey: ep.apiKey } : {}),
  });
};

/** Whether a model should be called at all: not in offline mode and not when a key is missing. */
export function modelAvailable(env: Record<string, string | undefined> = process.env): boolean {
  if (env.OFFLINE === "1" || env.CONSULT_DRAFT_MODEL === "off") return false;
  return Boolean(env.LLM_API_KEY || env.OPENROUTER_API_KEY);
}

/** The model's draft, or null (the caller then uses the rule-based draft). Never throws. `chat` is injectable for tests. */
export async function modelConsultDraft(f: ConsultFacts, chat: Chat = defaultChat): Promise<{ text: string; model: string } | null> {
  try {
    const reply = await chat({ system: CONSULT_SYSTEM, user: consultPrompt(f) });
    const text = parseConsultDraft(reply);
    return text ? { text: `${text}\n\n(Drafted by your agent with a language model from the request. Check it: it is not sent until you send it.)`, model: process.env.AGENT_LLM_MODEL || CHAT_MODEL } : null;
  } catch {
    return null;
  }
}
