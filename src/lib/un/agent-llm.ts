import { parseBaseUrl, SijilLiveError } from "./sijil-live.ts";

/** Where the agent's model calls go when pre-inference screening is on:
 * the Sijil node's OpenAI-compatible /v1 base URL (it proxies to the
 * upstream provider after screening the exact prompt). Unset means the
 * calls go straight to LLM_BASE_URL as before. */
export interface AgentLlmEndpoint {
  /** e.g. https://sijil-node.onrender.com/v1 — chatCompletion appends /chat/completions. */
  baseUrl: string;
  /** Sent as the Bearer token when set. The node does not check it today
   * (agent auth is by agent token elsewhere); set any non-empty value. */
  apiKey?: string;
}

/** null when AGENT_LLM_BASE_URL is unset/blank (calls go direct); throws
 * SijilLiveError on an invalid URL — the message never contains the key. */
export function agentLlmEndpoint(env: Record<string, string | undefined> = process.env): AgentLlmEndpoint | null {
  const raw = env.AGENT_LLM_BASE_URL?.trim();
  if (!raw) return null;
  return {
    baseUrl: parseBaseUrl(raw, "AGENT_LLM_BASE_URL"),
    apiKey: env.AGENT_LLM_API_KEY?.trim() || undefined,
  };
}
