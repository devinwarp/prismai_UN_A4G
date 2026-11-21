// Adapter for stage 2 of the journey bar. Per-use-case effective gates are being added by another
// workstream (gates per rule set and per use case). Until that lands this returns null, and stage 2
// reads "not yet". To wire it: return { accepted } from that workstream's record of a person
// accepting this use case's flags and gates.
export async function gateAcceptance(orgId: string, useCaseId: string): Promise<{ accepted: boolean } | null> {
  void orgId; void useCaseId;
  return null;
}
