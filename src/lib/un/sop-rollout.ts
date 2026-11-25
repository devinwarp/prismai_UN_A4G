import { rerunAffected } from "./gates-rerun";
import { attachSop } from "./profiles-store";
import { attachmentsOf, syncTicks } from "./sop-version-store";
import { loadUnUseCases } from "./store";
import type { SopVersion } from "./sop/versions";

export interface Rollout {
  version: number;
  /** Use cases that moved to the new version, and whether each was rerun (it is when it had an earlier run to repeat). */
  moved: { ext_id: string; rerun: boolean }[];
  /** Use cases left on an earlier version because they are deployed: they move only through a change request. */
  frozen: string[];
}

/** A new version of an SOP reaches every use case attached to it that is NOT deployed, in real time: each moves to the version, its job profiles follow
 * (a profile that is gone loses its Automate tick, a renamed one keeps it) and it is rerun as a new run. A deployed use case is never touched: it stays on
 * the version it has, with the job profiles it was deployed with. */
export async function rollOut(orgId: string, v: SopVersion, actor: string): Promise<Rollout> {
  const [atts, ucs] = await Promise.all([attachmentsOf(orgId, v.sop_id), loadUnUseCases(orgId)]);
  const names = v.profiles.map((p) => p.name);
  const m = v.changes?.manual;
  const renamed = m?.type === "update" && m.new_name ? { from: m.name, to: m.new_name } : undefined;
  const moved: string[] = [], frozen: string[] = [];
  for (const a of atts) {
    const uc = ucs.find((u) => u.id === a.use_case_id);
    if (!uc || a.version >= v.version) continue;
    if (uc.stage === "deployed") { frozen.push(uc.ext_id); continue; }
    if (await attachSop(orgId, uc.id, v.sop_id, actor, v.version)) continue;
    await syncTicks(orgId, uc.id, v.sop_id, names, renamed);
    moved.push(uc.ext_id);
  }
  const reran = moved.length ? await rerunAffected(orgId, moved, actor) : [];
  return { version: v.version, moved: moved.map((ext_id) => ({ ext_id, rerun: reran.some((r) => r.ext_id === ext_id) })), frozen };
}
