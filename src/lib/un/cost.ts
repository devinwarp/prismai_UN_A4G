import { AsyncLocalStorage } from "node:async_hooks";

// What the agent costs to test, tune and run: every model call and every tool call, counted where it happens and added up for the approver.
//
//  - A METER counts, for one piece of work (one pilot test, one judged test, one tuning cycle, one test generation, one production window),
//    the model calls and tokens per model and the tool calls. Meters nest: a pilot meter and the meter of each test inside it both see a call.
//    llm.ts records every model call into the meters that are open (cost.ts uses AsyncLocalStorage, so concurrent work keeps its own counts).
//  - TOKENS are always recorded. DOLLARS are worked out from a price table (data/model-prices.json, or MODEL_PRICES_JSON) that the organisation
//    fills from its provider's pricing: a model with no price is "unpriced", its tokens still count, and the total says so. A provider that
//    returns its own cost (OpenRouter) is used as it is. Nothing is invented.
// Pure apart from the meter's storage; the price file is read by prices().

export interface Usage { calls: number; prompt_tokens: number; completion_tokens: number; tool_calls: number }
export const emptyUsage = (): Usage => ({ calls: 0, prompt_tokens: 0, completion_tokens: 0, tool_calls: 0 });

/** Usage per model id, plus a cost the provider reported itself (USD), when it did. */
export interface ModelUsage extends Usage { provider_usd: number | null }
/** `elapsed_ms` is the wall-clock time the meter was open. Absent on records written before time was recorded. Summed snapshots add their
 * times, so for work done concurrently (judged tests) the sum is working time, not elapsed time. */
export interface UsageSnapshot { total: Usage; by_model: Record<string, ModelUsage>; elapsed_ms?: number }
export const emptySnapshot = (): UsageSnapshot => ({ total: emptyUsage(), by_model: {} });

export class Meter {
  private total = emptyUsage();
  private started = Date.now();
  private byModel = new Map<string, ModelUsage>();
  /** One model call: the model, the tokens it used (0 when unknown, e.g. the call failed), and the cost the provider reported, if any. */
  model(model: string, prompt = 0, completion = 0, providerUsd: number | null = null): void {
    const m = this.byModel.get(model) ?? { ...emptyUsage(), provider_usd: null };
    m.calls++; m.prompt_tokens += prompt; m.completion_tokens += completion;
    if (providerUsd !== null) m.provider_usd = (m.provider_usd ?? 0) + providerUsd;
    this.byModel.set(model, m);
    this.total.calls++; this.total.prompt_tokens += prompt; this.total.completion_tokens += completion;
  }
  tools(n = 1): void { this.total.tool_calls += n; }
  snapshot(): UsageSnapshot { return { elapsed_ms: Date.now() - this.started, total: { ...this.total }, by_model: Object.fromEntries([...this.byModel].map(([k, v]) => [k, { ...v }])) }; }
}

const scope = new AsyncLocalStorage<Meter[]>();

/** Run `fn` with a fresh meter open (inside any meters already open) and return its result with what it used. */
export async function metered<T>(fn: () => Promise<T>): Promise<{ result: T; usage: UsageSnapshot }> {
  const meter = new Meter();
  const result = await scope.run([...(scope.getStore() ?? []), meter], fn);
  return { result, usage: meter.snapshot() };
}

/** Called by llm.ts for every model call; a no-op when no meter is open. */
export function recordModelCall(model: string, prompt = 0, completion = 0, providerUsd: number | null = null): void {
  for (const m of scope.getStore() ?? []) m.model(model, prompt, completion, providerUsd);
}
/** Count tool calls made while a meter is open (the agent's tool calls of a run). */
export function recordToolCalls(n: number): void {
  for (const m of scope.getStore() ?? []) m.tools(n);
}

export function addSnapshots(a: UsageSnapshot, b: UsageSnapshot): UsageSnapshot {
  const out = emptySnapshot();
  out.elapsed_ms = (a.elapsed_ms ?? 0) + (b.elapsed_ms ?? 0);
  for (const s of [a, b]) {
    for (const k of Object.keys(out.total) as (keyof Usage)[]) out.total[k] += s.total[k];
    for (const [model, u] of Object.entries(s.by_model)) {
      const m = out.by_model[model] ?? { ...emptyUsage(), provider_usd: null };
      for (const k of Object.keys(emptyUsage()) as (keyof Usage)[]) m[k] += u[k];
      if (u.provider_usd !== null) m.provider_usd = (m.provider_usd ?? 0) + u.provider_usd;
      out.by_model[model] = m;
    }
  }
  return out;
}
export const sumSnapshots = (xs: UsageSnapshot[]): UsageSnapshot => xs.reduce(addSnapshots, emptySnapshot());

// ---- prices and cost ----------------------------------------------------------------------------------------------

/** USD per million tokens, or null where the organisation has not set a price. */
export interface Price { input: number | null; output: number | null }
export interface PriceTable { models: Record<string, Price>; /** USD per tool call, or null: tool calls are counted, not priced */ tool_call: number | null }
export const NO_PRICES: PriceTable = { models: {}, tool_call: null };

/** A price table from the JSON the organisation keeps. Anything that is not a non-negative number is "not set". */
export function parsePrices(raw: unknown): PriceTable {
  const o = (raw && typeof raw === "object" ? raw : {}) as { models?: Record<string, { input?: unknown; output?: unknown }>; tool_call?: unknown };
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  return {
    models: Object.fromEntries(Object.entries(o.models ?? {}).filter(([k]) => !k.startsWith("_")).map(([k, v]) => [k, { input: num(v?.input), output: num(v?.output) }])),
    tool_call: num(o.tool_call),
  };
}

export interface Cost {
  /** the total in USD, or null when nothing could be priced */
  usd: number | null;
  /** models that were used and have a price (or a cost the provider reported) / models used with no price */
  priced: string[];
  unpriced: string[];
  /** true when `usd` leaves out something that could not be priced: it is a lower bound, not the whole cost */
  partial: boolean;
  tool_calls: number;
}

/** What a usage costs. A model that was called but has no price is listed as unpriced and makes the total partial. */
export function costOf(u: UsageSnapshot, prices: PriceTable): Cost {
  let usd = 0, any = false;
  const priced: string[] = [], unpriced: string[] = [];
  for (const [model, m] of Object.entries(u.by_model)) {
    if (m.calls === 0) continue;
    const p = prices.models[model];
    if (m.provider_usd !== null) { usd += m.provider_usd; any = true; priced.push(model); }
    else if (p && p.input !== null && p.output !== null) { usd += (m.prompt_tokens * p.input + m.completion_tokens * p.output) / 1e6; any = true; priced.push(model); }
    else unpriced.push(model);
  }
  // tool calls are counted; they add to the cost only when the organisation has set a price per tool call
  if (u.total.tool_calls > 0 && prices.tool_call !== null) { usd += u.total.tool_calls * prices.tool_call; any = true; }
  return { usd: any ? Math.round(usd * 1e6) / 1e6 : null, priced, unpriced, partial: unpriced.length > 0, tool_calls: u.total.tool_calls };
}

// ---- the ledger: what the approver sees ----------------------------------------------------------------------------

export const STAGES = ["generation", "pilot", "judging", "tuning", "production"] as const;
export type CostStage = (typeof STAGES)[number];

/** One line of the ledger: a piece of work, when, what it used, and what that cost. */
export interface CostEntry {
  stage: CostStage;
  /** what it was: a pilot id, a tuning cycle's time, a monitoring window ... */
  ref: string;
  label: string;
  at: string;
  usage: UsageSnapshot;
  usd: number | null;
  unpriced: string[];
}

export interface CostSummary {
  entries: number;
  usage: UsageSnapshot;
  usd: number | null;
  unpriced: string[];
  /** model calls + tool calls, the "gross" count of what was used */
  gross_calls: number;
  by_stage: Record<CostStage, { entries: number; elapsed_ms: number; calls: number; tool_calls: number; prompt_tokens: number; completion_tokens: number; usd: number | null; unpriced: string[] }>;
}

/** The gross total of a ledger, and its breakdown by stage. The total in USD is the sum of the priced entries; `unpriced` lists every model whose cost is missing from it. */
export function summarise(entries: CostEntry[]): CostSummary {
  const by_stage = Object.fromEntries(STAGES.map((s) => [s, { entries: 0, elapsed_ms: 0, calls: 0, tool_calls: 0, prompt_tokens: 0, completion_tokens: 0, usd: null as number | null, unpriced: [] as string[] }])) as CostSummary["by_stage"];
  let usd: number | null = null;
  const unpriced = new Set<string>();
  for (const e of entries) {
    const s = by_stage[e.stage];
    s.entries++; s.elapsed_ms += e.usage.elapsed_ms ?? 0; s.calls += e.usage.total.calls; s.tool_calls += e.usage.total.tool_calls; s.prompt_tokens += e.usage.total.prompt_tokens; s.completion_tokens += e.usage.total.completion_tokens;
    if (e.usd !== null) { s.usd = (s.usd ?? 0) + e.usd; usd = (usd ?? 0) + e.usd; }
    for (const m of e.unpriced) { unpriced.add(m); if (!s.unpriced.includes(m)) s.unpriced.push(m); }
  }
  const usage = sumSnapshots(entries.map((e) => e.usage));
  const round = (v: number | null) => (v === null ? null : Math.round(v * 1e6) / 1e6);
  for (const s of Object.values(by_stage)) s.usd = round(s.usd);
  return { entries: entries.length, usage, usd: round(usd), unpriced: [...unpriced], gross_calls: usage.total.calls + usage.total.tool_calls, by_stage };
}

/** Make a ledger entry from a usage, priced with `prices`. */
export function entryOf(stage: CostStage, ref: string, label: string, at: string, usage: UsageSnapshot, prices: PriceTable): CostEntry {
  const c = costOf(usage, prices);
  return { stage, ref, label, at, usage, usd: c.usd, unpriced: c.unpriced };
}
