// SOP analysis contract (Phase 1, public reference slice). Pure types: no I/O.
// Every figure is computed in code against a SYNTHETIC baseline (fictional
// staffing assumptions); nothing here is a measurement of a real process.

export type AutomationClass = "automate" | "assist" | "keep_human";
export type StepKind = "start" | "step" | "decision" | "handoff" | "exception" | "end";
export type FlagId = "client_facing" | "affects_rights" | "irreversible";

/** Synthetic, editable assumptions. Echoed in every result so a reader can redo the sums. */
export interface SyntheticBaseline {
  version: "synthetic-v1";
  note: string;
  currency: string | null;
  /** Assumed cost per hour of staff time. */
  loaded_hourly_rate: number;
  /** Share of a step's time removed, by class (fictional, documented in data/sop-baseline.json). */
  share_by_class: Record<AutomationClass, number>;
  /** Minutes per step when the SOP text gives none, by step kind. */
  default_step_minutes: Record<StepKind, number>;
  /** Cases per year, by sop_id; `default_cases_per_year` when absent. */
  cases_per_year: Record<string, number>;
  default_cases_per_year: number;
}

export interface SopInput {
  sop_id: string;
  title: string;
  /** Plain text or markdown. The analyzer line-numbers it (1-based). */
  text: string;
  metadata: { entity: string; entity_sector?: string; departments?: string[] };
  baseline: SyntheticBaseline;
}

/** Lines start..end (1-based, inclusive). `quote` is a substring of those lines. */
export interface LineRef { start: number; end: number; quote: string }

export interface SopStep {
  id: string;
  kind: StepKind;
  text: string;
  actor: string | null;
  systems: string[];
  /** Minutes stated in the SOP text, else null (the baseline default is used). */
  minutes: number | null;
  cite: LineRef;
}

export interface AutomationCandidate {
  step_ids: string[];
  class: AutomationClass;
  /** Plain-language reason. */
  reason: string;
  basis: "rule" | "llm";
  hours_saved_per_year: number;
  cost_saved_per_year: number;
  confidence: number;
  cites: LineRef[];
}

export interface RiskFlags {
  client_facing: boolean;
  affects_rights: boolean;
  irreversible: boolean;
  evidence: Record<FlagId, LineRef[]>;
}

export interface SopAnalysis {
  sop_id: string;
  analyzer: { name: string; version: string; mode: "deterministic" | "llm" };
  steps: SopStep[];
  actors: string[];
  systems: string[];
  candidates: AutomationCandidate[];
  totals: {
    cases_per_year: number;
    baseline_hours_per_year: number;
    hours_saved_per_year: number;
    cost_saved_per_year: number;
    vs_baseline_pct: number;
    currency: string | null;
  };
  /** The synthetic assumptions behind the totals, echoed so a reader can redo the sums. */
  assumptions: { loaded_hourly_rate: number; share_by_class: Record<AutomationClass, number> };
  flags: RiskFlags;
  confidence: number;
  warnings: string[];
}

export interface SopAnalyzer {
  analyze(input: SopInput, signal?: AbortSignal): Promise<SopAnalysis>;
}
