import { approverOptions, type Approver } from "./approvers";
import { loadAttachedSop } from "./profiles-store";
import { getVersion, loadAttachment, profilesForUseCase } from "./sop-version-store";

/** The approvers allowed for gate changes on one use case: from its attached SOP (process owner first, then the
 * SOP's job titles), or the governance list when no SOP is attached. A stand-in for the org chart (see approvers.ts). */
export async function approversForUseCase(orgId: string, ucId: string): Promise<Approver[]> {
  const sopId = await loadAttachedSop(orgId, ucId);
  if (!sopId) return approverOptions({});
  // the owner and the job titles come from the version the use case is on (a deployed one keeps the version it was deployed with)
  const version = (await loadAttachment(orgId, ucId).catch(() => null))?.version ?? 1;
  const sopText = (await getVersion(orgId, sopId, version).catch(() => null))?.body ?? null;
  return approverOptions({ sopText, profiles: (await profilesForUseCase(orgId, ucId, sopId))?.map((p) => p.name) });
}
