import type { HitlFacts, HitlRuleId } from "./hitl.ts";
import { hitlBreaches } from "./hitl.ts";
import type { GateDef } from "./governance.ts";
import { GATES, decide, type Decision, type GateId, type GateState, type Requested } from "./policy.ts";
import { DERIVED_GAPS, RULESETS, UAE_FEDERAL, gateDivergence, hitlConfigFor, resolve, type DerivedGap, type GateDivergence, type RuleSet } from "./rulesets.ts";
import { S1 } from "./scenarios.ts";

// Runs decide() for one use case under every rule set. Pure.
export interface CompareInput { entity: string; facts: HitlFacts; requested: Requested; gates: GateState; hitlUnmet: HitlRuleId[] }
export interface CompareRow { rs: RuleSet; highRisk: boolean; decision: Decision }
export interface Comparison { rows: CompareRow[]; verdictsDiffer: boolean; gates: GateDivergence[]; gaps: DerivedGap[] }

export function compare(i: CompareInput): Comparison {
  const rows = RULESETS.map((base) => {
    const { rs, highRisk } = resolve(base, i.facts);
    const breaches = hitlBreaches(hitlConfigFor(rs, i.entity), i.entity, i.facts, i.hitlUnmet);
    const decision = decide({ clientFacing: i.facts.client_facing, requested: i.requested, gates: i.gates, hitlBreaches: breaches, ruleset: rs });
    return { rs, highRisk, decision };
  });
  const sets = rows.map((r) => r.rs);
  const gates = gateDivergence(sets);
  const gaps = DERIVED_GAPS.filter((g) => sets.some((s) => s.id === g.ruleset));
  return { rows, verdictsDiffer: new Set(rows.map((r) => r.decision.verdict)).size > 1, gates, gaps };
}

/** Evidence for UC02 as of a step of staged scenario S1 (T0..T4). */
export function s1EvidenceAt(step: string): { gates: GateState; hitlUnmet: HitlRuleId[] } {
  const gates: GateState = {};
  const met = new Map<HitlRuleId, boolean>();
  for (const s of S1.steps) {
    for (const e of s.events) {
      if (e.gate && e.status) gates[e.gate] = e.status;
      if (e.hitl) met.set(e.hitl.rule, e.hitl.met);
    }
    if (s.step === step) break;
  }
  return { gates, hitlUnmet: [...met].filter(([, m]) => !m).map(([r]) => r) };
}

// ---- Many processes, one policy layer (jurisdiction) -----------------------
export interface ProcessInput {
  id: string; entity: string; facts: HitlFacts; requested: Requested; gates: GateState; hitlUnmet: HitlRuleId[];
  /** Gates this process adds beyond the rule set (gates.ts effective gates), with the catalog that defines them. */
  useCaseGates?: GateId[];
  /** Gates waived through governance for this process (gates.ts): not required, as in decide(). */
  waived?: GateId[];
  catalog?: Record<GateId, GateDef>;
}
export interface ProcessRow {
  input: ProcessInput;
  highRisk: boolean;
  /** Gates this process must clear under the active policy. */
  required: GateId[];
  /** How many gates this process adds beyond the shipped rule set ("N gates added"). */
  gatesAdded: number;
  /** Subset of `required` that the process attributes added (vs a plain internal process). */
  addedByAttributes: GateId[];
  capped: boolean;
  decision: Decision;
  /** Same process judged under the UAE federal set, to show what the policy swap changed. */
  uae: Decision;
}

const requiredGates = (rs: RuleSet, clientFacing: boolean): GateId[] =>
  (Object.keys(GATES) as GateId[]).filter((g) => (clientFacing || !GATES[g].clientFacingOnly) && rs.gates.includes(g));

function judge(base: RuleSet, p: ProcessInput) {
  const { rs, highRisk } = resolve(base, p.facts);
  const breaches = hitlBreaches(hitlConfigFor(rs, p.entity), p.entity, p.facts, p.hitlUnmet);
  const decision = decide({ clientFacing: p.facts.client_facing, requested: p.requested, gates: p.gates, hitlBreaches: breaches, ruleset: rs, useCaseGates: p.useCaseGates, waived: p.waived, catalog: p.catalog });
  return { rs, highRisk, decision };
}

/** Judges each process under one rule set. Pure. */
export function compareProcesses(base: RuleSet, ps: ProcessInput[]): ProcessRow[] {
  const plain = resolve(base, { client_facing: false, affects_rights: false, irreversible: false }).rs;
  const baseline = requiredGates(plain, false);
  return ps.map((p) => {
    const { rs, highRisk, decision } = judge(base, p);
    const added = (p.useCaseGates ?? []).filter((g) => !requiredGates(rs, p.facts.client_facing).includes(g));
    const required = [...requiredGates(rs, p.facts.client_facing), ...added].filter((g) => !p.waived?.includes(g));
    return {
      input: p, highRisk, required, decision, gatesAdded: added.length,
      addedByAttributes: required.filter((g) => !baseline.includes(g) && !added.includes(g)),
      capped: p.facts.client_facing || rs.capAutonomy === "always",
      uae: judge(UAE_FEDERAL, p).decision,
    };
  });
}

/** Evidence level for processes without staged evidence. */
export function flatEvidence(allPass: boolean): GateState {
  return allPass ? Object.fromEntries((Object.keys(GATES) as GateId[]).map((g) => [g, "pass" as const])) : {};
}
