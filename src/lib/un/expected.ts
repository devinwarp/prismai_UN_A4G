import type { StepResult } from "./scenario.ts";

// Expected vs actual (C2-8): what ITU asks the video and the report to show.
// One row per released step, from the step results stored in the run.

export interface ExpectedRow {
  step: string;
  expected: string;
  actual: string;
  match: boolean;
}

export const expectedVsActual = (steps: Pick<StepResult, "step" | "expected" | "outcome" | "match">[]): ExpectedRow[] =>
  steps.map((s) => ({ step: s.step, expected: s.expected, actual: s.outcome, match: s.match }));

const csvCell = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export const expectedCsv = (rows: ExpectedRow[]): string =>
  ["step,expected,actual,match", ...rows.map((r) => [r.step, r.expected, r.actual, r.match ? "yes" : "no"].map(csvCell).join(","))].join("\n") + "\n";

export const expectedMarkdown = (rows: ExpectedRow[]): string =>
  ["| Step | Expected | Actual | Match |", "|---|---|---|---|", ...rows.map((r) => `| ${r.step} | ${r.expected} | ${r.actual} | ${r.match ? "✓" : "✕"} |`)].join("\n") + "\n";

export const matchSummary = (rows: ExpectedRow[]): string => `${rows.filter((r) => r.match).length} of ${rows.length} steps match the expected outcome`;
