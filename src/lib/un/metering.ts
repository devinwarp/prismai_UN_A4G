// Per-run metering. Tokens come from the provider's `usage` block when it is
// returned; wall-clock seconds are measured around each released step. The
// energy figure is NOT measured: it is tokens x a documented constant.
export interface Metering {
  /** Steps released with the model on (deterministic steps use no tokens). */
  llm_calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  /** Calls whose response carried no usage block; their tokens are unknown, not zero. */
  calls_without_usage: number;
  /** Measured wall-clock time summed over released steps. */
  wall_seconds: number;
}

/** ASSUMPTION, not a measurement: Wh per 1,000 tokens (input + output) for a
 * hosted LLM. Published per-query figures for large models vary by roughly an
 * order of magnitude (about 0.1 to 3 Wh per query depending on model, length
 * and hardware), so 0.3 Wh per 1k tokens is a round mid-range placeholder.
 * The real value depends on the provider and is not disclosed to us. Replace
 * it when the host publishes a figure. */
export const ASSUMED_WH_PER_1K_TOKENS = 0.3;

export const emptyMetering = (): Metering => ({
  llm_calls: 0, prompt_tokens: 0, completion_tokens: 0, calls_without_usage: 0, wall_seconds: 0,
});

export interface Usage { prompt_tokens?: number; completion_tokens?: number }

/** Pure: fold one released step into the running totals. `usages` has one entry per model call (undefined = no usage returned). */
export function addStepMetering(prev: Metering | undefined, usages: (Usage | undefined)[], wallSeconds: number): Metering {
  const m = { ...(prev ?? emptyMetering()) };
  for (const u of usages) {
    m.llm_calls += 1;
    if (!u || (u.prompt_tokens === undefined && u.completion_tokens === undefined)) m.calls_without_usage += 1;
    else {
      m.prompt_tokens += u.prompt_tokens ?? 0;
      m.completion_tokens += u.completion_tokens ?? 0;
    }
  }
  m.wall_seconds = Math.round((m.wall_seconds + wallSeconds) * 1000) / 1000;
  return m;
}

export const totalTokens = (m: Metering) => m.prompt_tokens + m.completion_tokens;

/** ESTIMATED energy in Wh (tokens x assumed constant). Never a measurement. */
export const estimatedWh = (m: Metering, whPer1k = ASSUMED_WH_PER_1K_TOKENS) => (totalTokens(m) / 1000) * whPer1k;
