import { approverOptions, type Approver } from "./approvers";
import { loadAttachedSop } from "./profiles-store";
import { profilesOf, sampleInput } from "./sop/data";

/** The approvers allowed for gate changes on one use case: from its attached SOP (process owner first, then the
 * SOP's job titles), or the governance list when no SOP is attached. A stand-in for the org chart (see approvers.ts). */
export async function approversForUseCase(orgId: string, ucId: string): Promise<Approver[]> {
  const sopId = await loadAttachedSop(orgId, ucId);
  if (!sopId) return approverOptions({});
  return approverOptions({ sopText: sampleInput(sopId)?.text ?? null, profiles: profilesOf(sopId)?.map((p) => p.name) });
}
