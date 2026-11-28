import { buildLedger, type Ledger } from "./cost-ledger";
import { loadAutoLog } from "./autotune-store";
import { loadPilots, loadReviewLog } from "./pilot-store";
import { prices } from "./price-store";
import { loadGenLog } from "./testgen-store";
import { listSopPilots } from "./sop-pilot-store";
import { loadWatch } from "./watchdog-store";
import { loadStructureLog } from "./sop-structure-store";
import { loadTargetLog } from "./target-store";

/** The cost ledger of a use case, read from the stored records and priced with the price table in force now. Read-only. A log that cannot be
 * read counts as no usage recorded there, never as a cost. */
export async function loadLedger(orgId: string, useCaseId: string, profiles: string[]): Promise<Ledger> {
  const none = async <T,>(p: Promise<T[]>): Promise<T[]> => p.catch(() => []);
  const [generation, pilots, reviews, tuning, watch, sopJobs, structuring, targets] = await Promise.all([
    Promise.all(profiles.map(async (profile) => ({ profile, entries: await none(loadGenLog(orgId, useCaseId, profile)) }))),
    Promise.all(profiles.map(async (profile) => (await none(loadPilots(orgId, useCaseId, profile))).map((p) => ({ profile, id: p.id, at: p.at, basis: p.basis, plan: p.plan })))).then((x) => x.flat()),
    Promise.all(profiles.map(async (profile) => ({ profile, entries: await none(loadReviewLog(orgId, useCaseId, profile)) }))),
    none(loadAutoLog(orgId, useCaseId)),
    none(loadWatch(orgId, useCaseId)),
    Promise.all(profiles.map(async (profile) => (await none(listSopPilots({ orgId, useCaseId, profile }, 50))).map((j) => ({ profile, id: j.id, at: j.startedAt, mode: j.mode, meter: j.meter })))).then((x) => x.flat()),
    none(loadStructureLog(orgId, useCaseId)),
    none(loadTargetLog(orgId, useCaseId)),
  ]);
  return buildLedger({ generation, pilots, reviews, tuning, watch, sopJobs, structuring: structuring as never, targets: targets as never }, prices());
}
