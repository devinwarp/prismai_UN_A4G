import { type UnUseCaseState, type Verdict } from "./model.ts";

// Integrity guard (I-1). A verdict is written only from a completed scenario
// run (and, since I-4, a human signature); `compliant` only from a passing
// Sijil attestation. Nothing else may set either, including admins. Pure: the
// routes and the database trigger (supabase/un-federal-t1.sql)
// enforce the same rules.

export const ENGINE_ONLY_FIELDS = ["verdict", "compliant", "stage"] as const;

export type PatchResult = { ok: true; patch: Record<string, unknown> } | { ok: false; error: string };

const HOW: Record<(typeof ENGINE_ONLY_FIELDS)[number], string> = {
  verdict: "it is written only from a signed scenario run",
  compliant: "it is written only from a passing Sijil attestation",
  stage: "it follows the use case's lifecycle: a verdict puts it in the pilot stage, and the approval and the go-live (which check the pilot report) set approved and deployed",
};

/** Validate a use-case PATCH body. Nothing about a use case is hand-editable: the verdict, compliance and the stage all come from the engine and the
 * lifecycle, and the dashboard shows what is in the database. Any of those fields is refused with the way it IS set; a body with none of them
 * changes nothing and is refused too. */
export function parseUseCasePatch(b: Record<string, unknown>): PatchResult {
  for (const f of ENGINE_ONLY_FIELDS) {
    if (f in b) return { ok: false, error: `${f} cannot be set by hand: ${HOW[f]}` };
  }
  return { ok: false, error: "A use case cannot be edited by hand: its stage, verdict and compliance are read from the lifecycle and the signed runs" };
}

/** The values the dashboard may show. A verdict without a run id, head hash
 * and signer, or a compliant flag without a report id, was not written by the
 * engine (hand-set or legacy) and is read as unset. */
export function engineValues<T extends UnUseCaseState>(u: T): T {
  const verdictOk = !!u.verdict_run_id && !!u.verdict_head_hash && !!u.verdict_signed_by;
  const compliantOk = !!u.compliant_report_id;
  if ((verdictOk || !u.verdict) && (compliantOk || !u.compliant)) return u;
  return { ...u, verdict: verdictOk ? u.verdict : null, compliant: compliantOk ? u.compliant : false };
}

/** `run.id` is the un_runs row id (uuid), not RunState.run_id. Columns to write when a completed run sets a use case's verdict (including the lifecycle stage:
 * a verdict puts the case in the pilot stage and no further; "approved" is set by the approval and "deployed" by the go-live, which check the pilot report). */
export function verdictPatch(
  run: { id: string; head_hash: string; done: boolean },
  verdict: Verdict,
  clientFacing: boolean,
  signed: { signer_id: string; signed_at: string },
): Record<string, unknown> {
  if (!run.done) throw new Error("verdict can only be written from a completed scenario run");
  if (!signed?.signer_id) throw new Error("verdict needs a human signature");
  if (clientFacing && verdict === "GO_AUTONOMOUS") throw new Error("client-facing use cases are capped at GO_SUPERVISED");
  // A verdict, whatever it is, is an assessment: it does not approve or deploy anything. (It used to mark a GO verdict "deployed", before the
  // pilot, the release gate and the go-live existed; the stage label then said "deployed" for an agent that was not in production.)
  const stage = "pilot";
  return { verdict, stage, verdict_run_id: run.id, verdict_head_hash: run.head_hash, verdict_signed_by: signed.signer_id, verdict_signed_at: signed.signed_at };
}

/** Columns to write when Sijil files a report. Only a passing one flips compliant. */
export function compliantPatch(report: { id: string; pass: boolean; sha256: string }): Record<string, unknown> {
  return { compliant: report.pass, compliant_report_id: report.pass ? report.id : null, compliant_report_sha256: report.sha256 };
}
