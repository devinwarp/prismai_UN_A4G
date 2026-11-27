// Spend limits for the SOP pilot. Every step is checked BEFORE it calls a model: a run that would pass its limit stops with a clear message and makes no more calls.
// A call is one request to the agent model or to the tuning agent. Pure: the route supplies the counts.

export const DEFAULT_RUN_CALLS = 200;
export const DEFAULT_DAY_CALLS = 600;

export interface PilotLimits { run: number; day: number }

const positive = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/** The limits in force: 200 calls a run and 600 a day per use case, unless the host sets SOP_PILOT_RUN_CALLS and SOP_PILOT_DAILY_CALLS. */
export const limitsFromEnv = (env: Record<string, string | undefined> = process.env): PilotLimits => ({
  run: positive(env.SOP_PILOT_RUN_CALLS, DEFAULT_RUN_CALLS),
  day: positive(env.SOP_PILOT_DAILY_CALLS, DEFAULT_DAY_CALLS),
});

export type BudgetCheck = { ok: true } | { ok: false; scope: "run" | "day"; message: string };

/** May `planned` more calls be made? `jobCalls` is what this run has made; `dayCalls` is what every run of the use case has made today (this run included). */
export function checkBudget(i: { jobCalls: number; dayCalls: number; planned: number; limits: PilotLimits }): BudgetCheck {
  if (i.jobCalls + i.planned > i.limits.run) {
    return { ok: false, scope: "run", message: `Stopped before the next step: this run has made ${i.jobCalls} of its ${i.limits.run} model calls and the next step needs ${i.planned} more. Raise SOP_PILOT_RUN_CALLS or approve fewer tests to run it.` };
  }
  if (i.dayCalls + i.planned > i.limits.day) {
    return { ok: false, scope: "day", message: `Stopped before the next step: this use case has made ${i.dayCalls} of its ${i.limits.day} Pilot model calls today and the next step needs ${i.planned} more. It can continue tomorrow, or raise SOP_PILOT_DAILY_CALLS.` };
  }
  return { ok: true };
}

/** The calls a whole run is expected to need, so a run that cannot finish within its limit is refused at the start rather than stopped halfway.
 * pilot: one call per test. tune: the baseline plus, for each further round, the tuning call and one call per test. certify: every test, every repetition. */
export function plannedRunCalls(mode: "pilot" | "tune" | "certify", tests: number, rounds: number, reps = 1): number {
  if (mode === "pilot") return tests;
  if (mode === "certify") return tests * reps;
  return tests + Math.max(0, rounds - 1) * (tests + 1);
}
