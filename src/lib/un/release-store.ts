import { replayReviews } from "./goal-judge";
import { loadReviewLog, loadPilots } from "./pilot-store";
import { loadAttachedSop, loadProfileRows } from "./profiles-store";
import { releaseReadiness, type ProfileEvidence, type Readiness } from "./release-gate";
import { profilesForUseCase } from "./sop-version-store";
import { loadTargetLog } from "./target-store";
import { replayTargets, type Target } from "./targets";
import { loadTestLog } from "./test-set-store";
import { inForce, replayTestSet } from "./test-sets";
import { replayGen } from "./testgen";
import { loadGenLog } from "./testgen-store";
import { loadParamLog } from "./verdict-param-store";
import { paramsHash, replayParams } from "./verdict-params";

export interface Release extends Readiness {
  /** The job profiles ticked to be automated. */
  profiles: string[];
  /** The approved process targets the readiness was judged against, or null. */
  targets: Target[] | null;
}

/** Everything the release gate reads for one use case, loaded from the stored records, and the gate's answer. Read-only. A log that
 * cannot be read (for example a table not applied yet) counts as nothing recorded, never as met. */
export async function loadRelease(orgId: string, useCaseId: string): Promise<Release> {
  const sopId = await loadAttachedSop(orgId, useCaseId);
  const known = new Set(((sopId && (await profilesForUseCase(orgId, useCaseId, sopId))) || []).map((p) => p.name));
  const names = sopId ? (await loadProfileRows(orgId, useCaseId, sopId)).filter((r) => r.automate && known.has(r.profile)).map((r) => r.profile) : [];
  const targets = await loadTargetLog(orgId, useCaseId).then((l) => replayTargets(l).approved?.targets ?? null).catch(() => null);
  const profiles: ProfileEvidence[] = await Promise.all(names.map(async (profile) => {
    const tset = replayTestSet(await loadTestLog(orgId, useCaseId, profile));
    const params = replayParams(await loadParamLog(orgId, useCaseId, profile)).approved?.params ?? null;
    const latest = (await loadPilots(orgId, useCaseId, profile))[0] ?? null;
    const original = latest ? (latest.basis?.pilot_id ?? latest.id) : null;
    const review = original ? (replayReviews(await loadReviewLog(orgId, useCaseId, profile).catch(() => [])).reviews[original] ?? null) : null;
    const rulings = await loadGenLog(orgId, useCaseId, profile).then((l) => replayGen(l, []).rulings).catch(() => []);
    return {
      profile,
      set_hash: inForce(tset) ? tset.approved!.hash : null,
      params, params_hash: params ? paramsHash(params) : null,
      report: latest?.report ?? null, basis_pilot_id: latest?.basis?.pilot_id ?? null, original_pilot_id: original, review, rulings,
    };
  }));
  return { ...releaseReadiness({ profiles, targets }), profiles: names, targets };
}
