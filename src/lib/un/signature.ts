import { verdictPatch } from "./guard.ts";
import { VERDICTS, type Verdict } from "./model.ts";
import type { RunState, Scenario } from "./scenario.ts";
import { appendTrace, verifyLog, type HumanSignature, type TraceRecord } from "./trace.ts";

// Human final approval of a run (I-4): the last chained record is a person's
// SIGN or WITHHOLD. The use-case verdict is written only after a SIGN.

export type SignInput = Pick<HumanSignature, "signer_id" | "role" | "decision" | "comment">;

/** The signature record, if the run ends with one. */
export const signatureOf = (run: RunState): TraceRecord | null => {
  const last = run.log[run.log.length - 1];
  return last?.signature ? last : null;
};

/** The verdict the human is asked to sign: the last step's outcome. */
export const verdictToSign = (run: RunState): Verdict | null => {
  const o = run.steps[run.steps.length - 1]?.outcome;
  return (VERDICTS as readonly string[]).includes(o ?? "") ? (o as Verdict) : null;
};

/** Pure: append the signature record after the last scenario step. Only a
 * completed, verified gate-scenario run can be signed, and only once. */
export function signRun(sc: Scenario, run: RunState, input: SignInput, now: () => string): RunState {
  if (sc.kind !== "gate") throw new Error("only a use-case (gate) scenario carries a verdict to sign");
  if (!run.done) throw new Error("release every step before signing");
  if (signatureOf(run)) throw new Error("run already signed or withheld");
  if (!input.signer_id) throw new Error("a signer is required");
  if (!input.comment.trim() && input.decision === "WITHHOLD") throw new Error("withholding needs a comment");
  const v = verifyLog(run.log);
  if (!v.ok) throw new Error(`trace log failed verification: ${v.reason}`);
  const verdict = verdictToSign(run);
  if (!verdict) throw new Error("the run has no verdict to sign");
  const verdictRec = [...run.log].reverse().find((r) => r.disposition === "verdict");
  const refs = verdictRec ? [verdictRec.trace_id] : [];
  const signature: HumanSignature = { type: "HUMAN_SIGNATURE", ...input, comment: input.comment.trim() };
  const verb = input.decision === "SIGN" ? "signed" : "withheld approval of";
  const text = `${input.role} ${input.signer_id} ${verb} ${verdict}${signature.comment ? `: ${signature.comment}` : ""}`;
  const log = appendTrace(run.log, {
    run_id: run.run_id, step: "SIGN", agent: "coordinator",
    role_mandate: "Records the human decision on the verdict; makes none of its own",
    inputs_seen: refs, claims: [{ text, evidence: refs }],
    kb_citations: [], proposal: verdict, confidence: "high", disposition: `signature: ${input.decision}`,
    message: null, derived_from: refs, signature, timestamp: now(),
  });
  return { ...run, log };
}

/** What the use case may be given: the verdict and signer, only after a SIGN. */
export function signedVerdict(run: RunState): { verdict: Verdict; signer_id: string; signed_at: string; head_hash: string } | null {
  const sig = signatureOf(run);
  const verdict = verdictToSign(run);
  if (!sig || sig.signature!.decision !== "SIGN" || !verdict || !run.done) return null;
  return { verdict, signer_id: sig.signature!.signer_id, signed_at: sig.timestamp, head_hash: sig.hash };
}

/** The use-case columns to write after a SIGN: verdict, run id, head hash and signer,
 * in one update (null for a run that is unsigned or withheld, which writes nothing).
 * `runRowId` is the un_runs id, and the head hash is the signature record's hash,
 * which is what un_runs.head_hash holds once the signed state is saved. */
export function verdictWriteFor(runRowId: string, run: RunState, clientFacing: boolean): Record<string, unknown> | null {
  const sv = signedVerdict(run);
  if (!sv) return null;
  return verdictPatch({ id: runRowId, head_hash: run.log[run.log.length - 1].hash, done: run.done }, sv.verdict, clientFacing, { signer_id: sv.signer_id, signed_at: sv.signed_at });
}
