// The setup journey: the five things an entity completes before its use cases can go through the lifecycle. Pure: no I/O.
//
//   country  rules and policy knowledge base ready, the country's policy target configured, and a governance admin appointed (they approve targets)
//   goals    the entity's service goals each carry a measurement and a target value
//   cases    the entity's use cases are registered (the upload, with an optional file of process targets)
//   targets  every use case has an APPROVED set of process targets
//   sop      every use case has an SOP attached
//
// Each step opens only when the one before it is done. This is a prerequisite chain, not the nine-stage lifecycle
// journey (journey.ts), which starts once the SOP is attached.

export const SETUP_STEPS = ["country", "goals", "cases", "targets", "sop"] as const;
export type SetupStepId = (typeof SETUP_STEPS)[number];
export type SetupState = "done" | "current" | "locked";

export interface SetupFacts {
  countryReady: boolean;
  /** The country has a policy target (the UAE always does: the framework policy on file; any other country only once an admin sets one). */
  policyReady: boolean;
  governanceAppointed: boolean;
  /** The chosen entity exists and every goal has a measurement. */
  goalsReady: boolean;
  cases: number;
  /** Use cases with an approved set of process targets, and with one proposed but not yet approved. */
  targetsApproved: number;
  targetsProposed: number;
  /** Use cases with an SOP attached. */
  attached: number;
}

export interface SetupStep {
  id: SetupStepId;
  n: number;
  state: SetupState;
  /** How many of the step's items are complete, for steps that count (cases, targets, sop). */
  count: { done: number; of: number } | null;
}

export interface SetupProgress { steps: SetupStep[]; done: number; next: SetupStepId | null }

/** A step is done by its own rule; the first step not done is the current one; every step after it is locked, even when
 * its own rule happens to hold (an SOP can be attached before the targets are approved, but the journey does not count
 * it until the step before it is done, the same internal control as journey.ts). */
export function setupProgress(f: SetupFacts): SetupProgress {
  const own: Record<SetupStepId, boolean> = {
    country: f.countryReady && f.policyReady && f.governanceAppointed,
    goals: f.goalsReady,
    cases: f.cases > 0,
    targets: f.cases > 0 && f.targetsApproved === f.cases,
    sop: f.cases > 0 && f.attached === f.cases,
  };
  const counts: Record<SetupStepId, SetupStep["count"]> = {
    country: null, goals: null, cases: null,
    targets: { done: f.targetsApproved, of: f.cases },
    sop: { done: f.attached, of: f.cases },
  };
  let open = true;
  const steps = SETUP_STEPS.map((id, k): SetupStep => {
    const state: SetupState = !open ? "locked" : own[id] ? "done" : "current";
    if (state !== "done") open = false;
    return { id, n: k + 1, state, count: counts[id] };
  });
  return { steps, done: steps.filter((s) => s.state === "done").length, next: steps.find((s) => s.state === "current")?.id ?? null };
}

/** Why a locked step is locked: the step it waits for. */
export const waitingFor = (p: SetupProgress, id: SetupStepId): SetupStepId | null => {
  const s = p.steps.find((x) => x.id === id);
  return s?.state === "locked" ? (p.next ?? null) : null;
};
