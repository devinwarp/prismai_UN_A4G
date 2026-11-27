import { entryOf, summarise, sumSnapshots, type CostEntry, type CostSummary, type PriceTable, type UsageSnapshot } from "./cost.ts";

// The cost ledger of one use case, built from what each stage recorded about its own usage: test generation (the generation log), pilots (the
// pilot report's agent line), judging (each judgment), tuning cycles (the auto-tuning log) and production (the monitoring windows). This is a
// pure function over those records; the loader that reads them from the stores is in cost-ledger-store.ts. Records written before metering
// existed carry no usage and add nothing: the ledger never estimates what was not recorded.

interface Logged { at: string; kind: string; payload: Record<string, unknown> }
export interface LedgerInput {
  /** per job profile */
  generation: { profile: string; entries: Logged[] }[];
  pilots: { profile: string; id: string; at: string; basis: unknown; plan: unknown }[];
  reviews: { profile: string; entries: Logged[] }[];
  tuning: Logged[];
  watch: Logged[];
  /** The SOP pilot's runs (baseline, tuning, certify): each run's own meter, which the run kept as it worked. */
  sopJobs?: { profile: string; id: string; at: string; mode: string; meter: unknown }[];
}

const isUsage = (u: unknown): u is UsageSnapshot => !!u && typeof u === "object" && !!(u as UsageSnapshot).total && typeof (u as UsageSnapshot).total.calls === "number" && !!(u as UsageSnapshot).by_model;

export interface Ledger { entries: CostEntry[]; summary: CostSummary }

export function buildLedger(i: LedgerInput, prices: PriceTable): Ledger {
  const out: CostEntry[] = [];
  const add = (stage: CostEntry["stage"], ref: string, label: string, at: string, u: unknown) => { if (isUsage(u) && (u.total.calls || u.total.tool_calls)) out.push(entryOf(stage, ref, label, at, u, prices)); };
  for (const g of i.generation) for (const e of g.entries) if (e.kind === "generated") add("generation", `${g.profile} @ ${e.at}`, `Test generation, ${g.profile}`, e.at, e.payload.usage);
  for (const p of i.pilots) {
    if (p.basis) continue; // a report recomputed after a goal review reuses the runs of the pilot it rests on: it makes no calls of its own
    const cost = ((p.plan as { agent?: { cost?: { usage?: unknown } } } | null)?.agent?.cost) ?? null;
    add("pilot", p.id, `Pilot, ${p.profile}`, p.at, cost?.usage);
  }
  for (const r of i.reviews) for (const e of r.entries) {
    if (e.kind !== "judged") continue;
    const js = Array.isArray(e.payload.judgments) ? (e.payload.judgments as { usage?: unknown }[]) : [];
    const used = js.map((j) => j.usage).filter(isUsage);
    if (used.length) add("judging", `${r.profile} @ ${e.at}`, `Goal judging, ${r.profile} (${used.length} tests)`, e.at, sumSnapshots(used));
  }
  for (const e of i.tuning) {
    if (e.kind !== "finished") continue;
    add("tuning", e.at, "Auto-tuning cycle", e.at, (e.payload.record as { usage?: unknown } | undefined)?.usage);
  }
  for (const e of i.watch) if (e.kind === "window") add("production", `window ${String(e.payload.window_no ?? "")}`.trim(), "Production monitoring window", e.at, e.payload.usage);
  // a certify run's report carries no cost line of its own, so a run is counted once, here
  for (const j of i.sopJobs ?? []) add(j.mode === "tune" ? "tuning" : "pilot", j.id, `SOP ${j.mode === "tune" ? "tuning run" : j.mode === "certify" ? "certify run" : "baseline pilot"}, ${j.profile}`, j.at, j.meter);
  out.sort((a, b) => (a.at < b.at ? -1 : 1));
  return { entries: out, summary: summarise(out) };
}
