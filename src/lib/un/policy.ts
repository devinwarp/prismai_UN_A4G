import type { Verdict } from "./model.ts";
import type { RuleSet } from "./rulesets.ts";
import { AI_DISCLOSURE_GATE } from "./ai-disclosure.ts";

// Deterministic policy engine. LLM agents propose and explain; only this code
// turns gate states into a verdict. Hard gates are never averaged: one failed
// gate rules out every GO verdict.
export type { RoleId, GateId, GateDef } from "./governance.ts";
import { SEED, type GateDef, type GateId } from "./governance.ts";

/** The nine shipped gates (see data/un-governance.json). */
export type BuiltinGateId =
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

/** The shipped gates, seeded from data/un-governance.json. optional = not applicable until a case adds it
 * (an accepted message about it puts it in CaseState.extraGates). Admin-added gates are not in here: they
 * reach decide() as `catalog` (see gates.ts). */
export const GATES: Record<GateId, GateDef> = SEED.gates;
const SHIPPED = GATES;

export type GateState = Partial<Record<GateId, GateStatus>>;

export const applicableGates = (clientFacing: boolean, extra: GateId[] = [], catalog: Record<GateId, GateDef> = GATES): GateId[] =>
  Object.keys(catalog).filter(
    (g) => g === AI_DISCLOSURE_GATE || ((clientFacing || !catalog[g].clientFacingOnly) && (!catalog[g].optional || extra.includes(g))),
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
  /** Jurisdiction rule set (rulesets.ts). Omitted = today's UAE behaviour. */
  ruleset?: RuleSet;
  /** Gate definitions including admin-added ones (gates.ts). Omitted = the shipped nine. */
  catalog?: Record<GateId, GateDef>;
  /** Gates this use case adds to its rule set's (always apply, whatever the flags). Add-only. */
  useCaseGates?: GateId[];
  /** Gates waived through governance: not required, but still listed on the trace by the caller. */
  waived?: GateId[];
}): Decision {
  const rs = opts.ruleset;
  const GATES = opts.catalog ?? SHIPPED;
  const base = rs
    ? Object.keys(GATES).filter(
        (g) => g === AI_DISCLOSURE_GATE || ((opts.clientFacing || !GATES[g].clientFacingOnly) && (rs.gates.includes(g) || !!opts.extraGates?.includes(g))),
      )
    : applicableGates(opts.clientFacing, opts.extraGates, GATES);
  const ids = [...new Set([...base, ...(opts.useCaseGates ?? []).filter((g) => Object.hasOwn(GATES, g))])]
    .filter((g) => g === AI_DISCLOSURE_GATE || !opts.waived?.includes(g));
  const capped = opts.clientFacing || rs?.capAutonomy === "always";
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
    if (capped && opts.requested === "GO_AUTONOMOUS") {
      reasons.unshift("Autonomy requested is above the cap for a client-facing use case");
    }
    return { verdict: "ESCALATE", reasons };
  }
  if (capped && opts.requested === "GO_AUTONOMOUS") {
    return {
      verdict: "GO_SUPERVISED",
      reasons: ["All gates passed; capped at GO_SUPERVISED because the use case is client-facing"],
    };
  }
  return { verdict: opts.requested, reasons: ["All applicable gates passed"] };
}
