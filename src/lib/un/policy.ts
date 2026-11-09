import type { Verdict } from "./model.ts";

// Deterministic policy engine. LLM agents propose and explain; only this code
// turns gate states into a verdict. Hard gates are never averaged: one failed
// gate rules out every GO verdict.
export type RoleId =
  | "innovator"
  | "policy_adviser"
  | "security"
  | "privacy"
  | "compliance"
  | "frontline"
  | "finance"
  | "coordinator";

export type GateId =
  | "approved_infrastructure"
  | "audit_log"
  | "data_lawful"
  | "human_final_approval"
  | "ai_disclosure"
  | "hallucination_rate"
  | "fee_accuracy"
  | "no_commercial_promotion"
  | "purpose_limitation";

/** unknown = no evidence yet; fix_declared = applicant says it is fixed but it
 * has not been re-tested; pass/fail need evidence (see protocol.ts). */
export type GateStatus = "unknown" | "pass" | "fail" | "fix_declared";

/** optional = not applicable until a case adds it (an accepted message about
 * it puts it in CaseState.extraGates). Keeps S1/S3 outcomes unchanged. */
export const GATES: Record<GateId, { label: string; owner: RoleId; clientFacingOnly: boolean; kbQuery: string; optional?: boolean }> = {
  approved_infrastructure: {
    label: "Model calls and data stay on approved (DESC-certified) infrastructure",
    owner: "security",
    clientFacingOnly: false,
    kbQuery: "hosting certified cloud infrastructure data location security requirements",
  },
  audit_log: {
    label: "Every action is written to the audit log",
    owner: "security",
    clientFacingOnly: false,
    kbQuery: "logging audit trail traceability records of agent actions monitoring",
  },
  data_lawful: {
    label: "Data is lawfully usable for this purpose",
    owner: "privacy",
    clientFacingOnly: false,
    kbQuery: "personal data protection lawful processing consent privacy purpose limitation",
  },
  human_final_approval: {
    label: "A person gives final approval before any output reaches a citizen",
    owner: "compliance",
    clientFacingOnly: true,
    kbQuery: "human oversight review approve override before action human in the loop",
  },
  ai_disclosure: {
    label: "The citizen is told they are dealing with an AI assistant",
    owner: "compliance",
    clientFacingOnly: true,
    kbQuery: "inform users they are interacting with AI transparency disclosure",
  },
  hallucination_rate: {
    label: "Measured hallucination rate stays under the agreed threshold",
    owner: "compliance",
    clientFacingOnly: false,
    optional: true,
    kbQuery: "accuracy reliability monitoring transparency inform users interacting with AI",
  },
  fee_accuracy: {
    label: "Fees and amounts quoted to citizens match the published fee table",
    owner: "compliance",
    clientFacingOnly: true,
    optional: true,
    kbQuery: "accuracy of information given to citizens fees transparency reliability monitoring",
  },
  no_commercial_promotion: {
    label: "The assistant does not promote paid third-party products to citizens",
    owner: "compliance",
    clientFacingOnly: true,
    optional: true,
    kbQuery: "AI systems should be fair transparent accountable understandable consumer commercial promotion",
  },
  purpose_limitation: {
    label: "Data is used only for its declared purpose, with no inferred sensitive attributes",
    owner: "privacy",
    clientFacingOnly: false,
    optional: true,
    kbQuery: "collected for a specific and clear purpose, not processed at any later time in a manner incompatible with such purpose",
  },
};

export type GateState = Partial<Record<GateId, GateStatus>>;

export const applicableGates = (clientFacing: boolean, extra: GateId[] = []): GateId[] =>
  (Object.keys(GATES) as GateId[]).filter(
    (g) => (clientFacing || !GATES[g].clientFacingOnly) && (!GATES[g].optional || extra.includes(g)),
  );

export type Requested = Extract<Verdict, "GO_AUTONOMOUS" | "GO_SUPERVISED" | "ASSISTANT_ONLY">;

export interface Decision {
  verdict: Verdict;
  reasons: string[];
}

/** Precedence: a failed gate beats everything (NO_GO); then declared-but-
 * untested fixes (ASSISTANT_ONLY: the agent prepares, a person acts); then
 * missing evidence (ESCALATE). With every gate passed, a client-facing case
 * is capped at GO_SUPERVISED, however much autonomy was requested. */
export function decide(opts: {
  clientFacing: boolean;
  requested: Requested;
  gates: GateState;
  extraGates?: GateId[];
  /** Human-in-the-loop rules (hitl.ts) the use case breaches. Any one is a
   * hard failure of human_final_approval, whatever that gate's own state. */
  hitlBreaches?: string[];
}): Decision {
  const ids = applicableGates(opts.clientFacing, opts.extraGates);
  if (opts.hitlBreaches?.length) {
    const failed = ids.filter((g) => g !== "human_final_approval" && opts.gates[g] === "fail");
    return {
      verdict: "NO_GO",
      reasons: [
        ...failed.map((g) => `Gate failed: ${GATES[g].label}`),
        `Gate failed: ${GATES.human_final_approval.label} (human-in-the-loop rule unmet: ${opts.hitlBreaches.join(", ")})`,
      ],
    };
  }
  const st = (g: GateId): GateStatus => opts.gates[g] ?? "unknown";
  const label = (g: GateId) => GATES[g].label;
  const failed = ids.filter((g) => st(g) === "fail");
  if (failed.length) {
    return { verdict: "NO_GO", reasons: failed.map((g) => `Gate failed: ${label(g)}`) };
  }
  const declared = ids.filter((g) => st(g) === "fix_declared");
  if (declared.length) {
    return {
      verdict: "ASSISTANT_ONLY",
      reasons: declared.map((g) => `Fix declared, not yet re-tested: ${label(g)}`),
    };
  }
  const unknown = ids.filter((g) => st(g) === "unknown");
  if (unknown.length) {
    const reasons = unknown.map((g) => `No evidence yet: ${label(g)}`);
    if (opts.clientFacing && opts.requested === "GO_AUTONOMOUS") {
      reasons.unshift("Autonomy requested is above the cap for a client-facing use case");
    }
    return { verdict: "ESCALATE", reasons };
  }
  if (opts.clientFacing && opts.requested === "GO_AUTONOMOUS") {
    return {
      verdict: "GO_SUPERVISED",
      reasons: ["All gates passed; capped at GO_SUPERVISED because the use case is client-facing"],
    };
  }
  return { verdict: opts.requested, reasons: ["All applicable gates passed"] };
}
