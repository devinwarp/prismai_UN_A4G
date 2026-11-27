// The shape of a use case's run cost on the dashboard register. Types only, so client components can import it.
export type RunStage = "generation" | "pilot" | "judging" | "tuning" | "production";
export interface RunCostLine { stage: RunStage; label: string; at: string; elapsed_ms: number; calls: number; usd: number | null }
export interface RunCost {
  /** Dollars, from the price table in force now. null when nothing recorded could be priced. */
  usd: number | null;
  /** Working time: the sum of the time of every model call, so concurrent calls add up. */
  elapsed_ms: number;
  calls: number;
  /** Models used with no price set: their calls are counted, their dollars are not. */
  unpriced: string[];
  runs: RunCostLine[];
}

