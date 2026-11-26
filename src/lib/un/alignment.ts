import type { UnUseCaseState } from "./model.ts";

// Alignment. A use case is "aligned" when it meets its goals and rules; Sijil is the planned measure of that (a passing attestation over a number of
// agent runs). Sijil is not integrated yet, so for now EVERY use case is read as aligned and no attestation is needed. Nothing is written to the
// database for this: the stored flag (`un_use_cases.compliant`) is left exactly as the engine wrote it, and the reading is applied when use cases are
// loaded for display. Once Sijil is integrated (SIJIL_INTEGRATED=1), the stored attestation decides again, use case by use case.

export const sijilIntegrated = (): boolean => process.env.SIJIL_INTEGRATED === "1";

export const ALIGNMENT_ASSUMED_NOTE = "Alignment is assumed for every use case until Sijil is integrated.";

/** The use case as the dashboard reads it: aligned for every use case while Sijil is not integrated, else as attested. */
export function withAlignment<T extends UnUseCaseState>(u: T): T {
  return sijilIntegrated() || u.compliant ? u : { ...u, compliant: true };
}
