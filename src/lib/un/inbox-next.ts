import type { StageId } from "./journey.ts";
import { route, type Holder, type Letter, type Recipient, type Step } from "./raci.ts";

// Who a use case's next step is with, when no inbox request is open for it: the step's holders by the RACI table. Pure: no I/O.

const STEP_OF: Record<StageId, Step> = { sop: "sop_setup", gates: "approval", verdict: "approval", tests: "tests", pilot: "pilot", evals: "approval", tuning: "approval", approval: "approval", production: "deploy" };
const ACTS: readonly Letter[] = ["R", "A", "AR"];

export function nextActors(stage: StageId, holders: Holder[], overrides: { user_id: string; letter: Letter }[] = []): Recipient[] {
  // gate evidence and the verdict are signed by the process owner alone ("run.sign"), whatever the step's other holders may do
  if (stage === "gates" || stage === "verdict") return holders.filter((h) => h.positions.includes("owner")).map((h) => ({ user_id: h.user_id, letter: "A" as const }));
  return route(STEP_OF[stage], holders, overrides).filter((r) => ACTS.includes(r.letter));
}

export const stepOfStage = (stage: StageId): Step => STEP_OF[stage];
