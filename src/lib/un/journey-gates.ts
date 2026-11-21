import type { HitlFacts } from "./hitl.ts";
import { acceptanceOf, effectiveGates } from "./gates";
import { factsOf, loadGov } from "./gates-store";
import { loadRun } from "./runs";
import type { UnUseCaseState } from "./model";

type Uc = Pick<UnUseCaseState, "ext_id" | "client_facing" | "affects_rights" | "irreversible" | "verdict_run_id">;

/** Stage 2 of the journey bar, from the real effective gates (gates.ts): flags are the use case's, widened by the
 * flags of its ticked SOP job profiles (`extra`, a flag is on if any ticked profile has it). Accepted when every
 * effective, non-waived gate passes on the use case's signed verdict run and every waiver and added gate is signed. */
export async function gateAcceptance(orgId: string, uc: Uc, extra?: HitlFacts): Promise<{ accepted: boolean }> {
  const f = factsOf(uc);
  const facts = { client_facing: f.client_facing || !!extra?.client_facing, affects_rights: f.affects_rights || !!extra?.affects_rights, irreversible: f.irreversible || !!extra?.irreversible };
  const gov = await loadGov(orgId);
  const run = uc.verdict_run_id ? await loadRun(orgId, uc.verdict_run_id) : null;
  const { accepted } = acceptanceOf(effectiveGates({ ext: uc.ext_id, facts, gov }), uc.ext_id, run?.state.state?.gates ?? {}, gov);
  return { accepted };
}
