// The S3 federal-cascade scenario runs on a sandbox copy of the use cases, starting from 0 deployed.
// Its figures (e.g. 6/20 deployed) are not the live register's. Every place that shows one labels it.
export const SANDBOX_KEY = "sbx.label";
export const SANDBOX_EN = "Sandbox copy, not the live register";

/** A portfolio-scenario outcome line (see fmt() in scenario.ts), as opposed to a verdict. */
export const isSandboxOutcome = (outcome: string) => /^deployed \d+\/\d+/.test(outcome);
