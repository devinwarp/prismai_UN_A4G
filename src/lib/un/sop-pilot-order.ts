import type { Journey } from "./journey.ts";
import { SCENARIOS } from "./scenarios.ts";

// The stage-order check of the SOP pilot. The journey is walked in order (journey.ts); the pilot route used to ignore it. A pilot may start only when the SOP
// stage is done and, for a use case that has a verdict path, gates are accepted and the verdict is signed.
//
// ONE labelled exemption: a use case with no verdict path (verdicts come only from the staged scenarios, scenarios.ts, which exist for three use cases) can
// never accept gates or sign a verdict, so refusing its pilot would make it unreachable. Such a pilot is allowed and marked, and nothing else is bypassed:
// the journey does not count approval or production without those stages (journey.ts), and the release gate is unchanged.

export const EXEMPT_NO_VERDICT_PATH = "Ran before gates and verdict: this use case has no verdict path yet, so those stages cannot be done. Approval still needs them.";

/** Does a staged scenario exist that could give this use case a verdict? Only the staged scenarios (scenarios.ts) produce a verdict. */
export const hasVerdictPath = (ext: string) => Object.values(SCENARIOS).some((s) => s.kind === "gate" && s.ext_id === ext);

export type PilotOrder = { ok: true; exempt?: string } | { ok: false; reason: string };

const stateOf = (journey: Journey, id: string) => journey.stages.find((s) => s.id === id)?.state;

export function pilotOrder(journey: Journey | null, hasVerdictPath: boolean): PilotOrder {
  if (!journey) return { ok: false, reason: "The use case's journey could not be read, so the order of the stages could not be checked." };
  if (stateOf(journey, "sop") !== "done") return { ok: false, reason: "SOP intake is not complete: attach the SOP, build its knowledge base and tick a job profile first." };
  const gates = stateOf(journey, "gates") === "done";
  const verdict = stateOf(journey, "verdict") === "done";
  if (gates && verdict) return { ok: true };
  if (hasVerdictPath) {
    return { ok: false, reason: `${!gates ? "Gates are not accepted" : "The verdict is not signed"} yet. A pilot comes after gates and the verdict: finish those stages first.` };
  }
  return { ok: true, exempt: EXEMPT_NO_VERDICT_PATH };
}
