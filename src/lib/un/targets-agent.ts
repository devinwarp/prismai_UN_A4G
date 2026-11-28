import { metered } from "./cost.ts";
import { hasMeasuredGoals } from "./goals.ts";
import { approvalRuleWarning, draftWithWording } from "./targets-draft.ts";
import { proposeTargetsFor } from "./targets-propose.ts";
import { loadGoalsResolved, loadTargetLog } from "./target-store.ts";
import { replayTargets, targetsHash } from "./targets.ts";
import type { UnUseCaseState } from "./model.ts";

// The targets agent: when a use case exists and its entity's goals are measured, it writes the process targets as a PENDING
// proposal and the approvers are told. It never approves. It leaves alone anything a person has already settled or started:
// an approved set, or a proposal a person wrote or edited.

/** The agent's identity in the log. `by` begins with "agent:", so a person approving its draft is not approving their own work. */
export const TARGETS_AGENT = { id: "agent:targets", email: "Targets agent" } as const;

export type DraftOutcome =
  | { ext_id: string; outcome: "drafted"; worded_by: "model" | "rules" }
  | { ext_id: string; outcome: "skipped"; reason: "approved" | "person_proposal" | "up_to_date" | "goals_not_measured" | "nothing_to_draft" }
  | { ext_id: string; outcome: "failed"; error: string };

type UseCase = Pick<UnUseCaseState, "id" | "ext_id" | "entity" | "title" | "description" | "client_facing" | "affects_rights" | "irreversible" | "hitl_rule">;

/** Draft one use case's targets. `model: false` keeps it to the rules draft (a batch of use cases must not wait on a model). Never throws. */
export async function draftTargetsFor(orgId: string, uc: UseCase, opts: { model?: boolean } = {}): Promise<DraftOutcome> {
  try {
    const state = replayTargets(await loadTargetLog(orgId, uc.id));
    if (state.approved && !state.pending) return { ext_id: uc.ext_id, outcome: "skipped", reason: "approved" };
    if (state.pending && state.pending.by !== TARGETS_AGENT.id) return { ext_id: uc.ext_id, outcome: "skipped", reason: "person_proposal" };
    const { goals } = await loadGoalsResolved(orgId, uc.entity);
    if (!hasMeasuredGoals(goals)) return { ext_id: uc.ext_id, outcome: "skipped", reason: "goals_not_measured" };
    const { result: draft, usage } = await metered(() => draftWithWording(goals, { ext_id: uc.ext_id, title: uc.title, entity: uc.entity, description: uc.description, client_facing: uc.client_facing, affects_rights: uc.affects_rights, irreversible: uc.irreversible, hitl_rule: uc.hitl_rule }, undefined, opts.model === false ? false : undefined));
    if (!draft.targets.length) return { ext_id: uc.ext_id, outcome: "skipped", reason: "nothing_to_draft" };
    // the same draft as the one already waiting: do not raise a second notification for it
    if (state.pending && targetsHash(state.pending.targets) === targetsHash(draft.targets)) return { ext_id: uc.ext_id, outcome: "skipped", reason: "up_to_date" };
    const note = `Drafted by the targets agent from the entity goals and the use case's flags (${draft.worded_by === "model" ? "wording by a language model, figures from the goals" : "rules only"}). A person edits and approves.`;
    const warning = approvalRuleWarning(uc);
    const r = await proposeTargetsFor(orgId, uc, draft.targets, TARGETS_AGENT, warning ? `${note} Warning: ${warning}` : note, usage.total.calls ? usage : undefined);
    return r.outcome === "failed" ? { ext_id: uc.ext_id, outcome: "failed", error: r.error } : r.outcome === "unchanged" ? { ext_id: uc.ext_id, outcome: "skipped", reason: "approved" } : { ext_id: uc.ext_id, outcome: "drafted", worded_by: draft.worded_by };
  } catch (e) {
    return { ext_id: uc.ext_id, outcome: "failed", error: e instanceof Error ? e.message : "The targets could not be drafted" };
  }
}

/** Draft for many use cases (an upload, or a change of an entity's goals). The model is used only for a handful: a long
 * list gets the rules draft, so the request that triggered it does not wait on one model call per use case. */
export async function draftTargetsForAll(orgId: string, ucs: UseCase[], opts: { modelUpTo?: number } = {}): Promise<DraftOutcome[]> {
  const model = ucs.length <= (opts.modelUpTo ?? 3);
  const out: DraftOutcome[] = [];
  for (const uc of ucs) out.push(await draftTargetsFor(orgId, uc, { model }));
  return out;
}
