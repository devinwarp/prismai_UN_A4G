import type { UsageSnapshot } from "./cost.ts";
import { noticeApproval } from "./inbox-service.ts";
import { appendTargetLog, loadGoalsResolved, loadTargetLog } from "./target-store.ts";
import { appendTargets, planTargets, replayTargets, verifyTargets, type Target } from "./targets.ts";

export type ProposeResult =
  | { ext_id: string; outcome: "proposed"; hash: string }
  | { ext_id: string; outcome: "unchanged" }
  | { ext_id: string; outcome: "failed"; error: string };

/** Propose a use case's targets from an upload: the same steps as the targets route (verify the chain, plan, append one
 * entry, tell the approvers), without the permission check, which the caller has already made. The list only becomes
 * a PENDING proposal: a different person still approves it. Never throws. */
export async function proposeTargetsFor(orgId: string, uc: { id: string; ext_id: string; entity: string }, targets: Target[], actor: { id: string; email: string | null }, note: string, usage?: UsageSnapshot): Promise<ProposeResult> {
  const failed = (error: string): ProposeResult => ({ ext_id: uc.ext_id, outcome: "failed", error });
  try {
    const log = await loadTargetLog(orgId, uc.id);
    const v = verifyTargets(log);
    if (!v.ok) return failed(`The target log failed verification at entry ${v.broken_seq}: ${v.reason}`);
    const { goals } = await loadGoalsResolved(orgId, uc.entity);
    const plan = planTargets(replayTargets(log), { type: "propose", targets, note }, actor.id, goals);
    // an upload that repeats what is already approved is not an error: there is simply nothing to propose
    if (!plan.ok) return /already approved and nothing has changed/.test(plan.error) ? { ext_id: uc.ext_id, outcome: "unchanged" } : failed(plan.error);
    const entry = appendTargets(log[log.length - 1] ?? null, plan.kind, actor.email ?? actor.id, usage ? { ...plan.payload, usage } : plan.payload, new Date().toISOString());
    const err = await appendTargetLog(orgId, uc.id, entry);
    if (err) return failed(/duplicate|unique/i.test(err) ? "Someone else changed the targets just now; propose again from the targets step." : err);
    await noticeApproval(orgId, uc.id, { step: "targets", what: "Process targets", event: "request", ext: uc.ext_id, by: actor.id, link: `/admin/federal/setup?step=targets&uc=${encodeURIComponent(uc.ext_id)}`, ref: entry.hash.slice(0, 8) });
    return { ext_id: uc.ext_id, outcome: "proposed", hash: entry.hash };
  } catch (e) {
    return failed(e instanceof Error ? e.message : "The targets could not be saved");
  }
}
