import type { AutomationClass, StepKind, SyntheticBaseline } from "./types.ts";

// Validation for data/sop-baseline.json. Pure: the file is read by data.ts.
const CLASSES: AutomationClass[] = ["automate", "assist", "keep_human"];
const KINDS: StepKind[] = ["start", "step", "decision", "handoff", "exception", "end"];
const pos = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

/** Returns the baseline or throws one readable error listing every problem. */
export function parseBaseline(raw: unknown): SyntheticBaseline {
  const b = (raw ?? {}) as Record<string, unknown>;
  const errs: string[] = [];
  if (b.version !== "synthetic-v1") errs.push('version must be "synthetic-v1"');
  if (b.currency !== "XXD") errs.push('currency must be "XXD" (fictional unit)');
  if (typeof b.note !== "string" || !/fictional|synthetic/i.test(b.note)) errs.push("note must say the figures are fictional or synthetic");
  if (!pos(b.loaded_hourly_rate)) errs.push("loaded_hourly_rate must be a positive number");
  if (!pos(b.default_cases_per_year)) errs.push("default_cases_per_year must be a positive number");
  const share = (b.share_by_class ?? {}) as Record<string, unknown>;
  for (const c of CLASSES) if (typeof share[c] !== "number" || share[c] < 0 || share[c] > 1) errs.push(`share_by_class.${c} must be between 0 and 1`);
  if (share.keep_human !== 0) errs.push("share_by_class.keep_human must be 0");
  const mins = (b.default_step_minutes ?? {}) as Record<string, unknown>;
  for (const k of KINDS) if (!pos(mins[k])) errs.push(`default_step_minutes.${k} must be a positive number`);
  const cases = (b.cases_per_year ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(cases)) if (!pos(v)) errs.push(`cases_per_year.${k} must be a positive number`);
  if (errs.length) throw new Error(`Invalid SOP baseline: ${errs.join("; ")}.`);
  return b as unknown as SyntheticBaseline;
}
