import type { Journey } from "./journey.ts";

// The stage-order check of the SOP pilot. The journey is walked in order (journey.ts); a pilot may start only when the SOP stage is done, gates are accepted and
// the verdict is signed. Every use case has a verdict path (evidence-scenario.ts: the people who own each gate record the evidence, a person signs), so there is
// no exemption: a use case that has not recorded its gate evidence and signed its verdict cannot pilot.

export type PilotOrder = { ok: true } | { ok: false; reason: string };

const stateOf = (journey: Journey, id: string) => journey.stages.find((s) => s.id === id)?.state;

export function pilotOrder(journey: Journey | null): PilotOrder {
  if (!journey) return { ok: false, reason: "The use case's journey could not be read, so the order of the stages could not be checked." };
  if (stateOf(journey, "sop") !== "done") return { ok: false, reason: "SOP intake is not complete: attach the SOP, build its knowledge base and tick a job profile first." };
  const gates = stateOf(journey, "gates") === "done";
  const verdict = stateOf(journey, "verdict") === "done";
  if (gates && verdict) return { ok: true };
  return { ok: false, reason: `${!gates ? "Gates are not accepted" : "The verdict is not signed"} yet. A pilot comes after gates and the verdict: record the gate evidence and sign the verdict first.` };
}
