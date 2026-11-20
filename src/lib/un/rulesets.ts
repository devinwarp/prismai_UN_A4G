import type { GateId } from "./policy.ts";
import type { HitlConfig, HitlFacts, HitlRuleId } from "./hitl.ts";
import { HITL_RULE_IDS } from "./hitl.ts";

// Per-jurisdiction rule sets. SIMPLIFIED DEMO ENCODINGS, NOT LEGAL ADVICE: each
// maps a few ingested provisions onto the existing gate vocabulary so the same
// use case can be judged side by side. Pure: no I/O. decide() takes an optional
// RuleSet; without one it behaves exactly as before (the UAE set mirrors it).
export interface RuleSet {
  id: "uae-federal" | "eu-ai-act" | "sg-imda";
  name: string;
  /** Gates required by default (client-facing-only gates still need a client-facing case). */
  gates: GateId[];
  /** "client_facing": a client-facing case is capped at GO_SUPERVISED. "always": every case is. */
  capAutonomy: "client_facing" | "always";
  /** Human-in-the-loop rules this jurisdiction switches on by default. */
  hitlDefaults: HitlRuleId[];
  /** Demo values for measured thresholds; informational, not read by decide(). */
  thresholds: Record<string, number>;
  /** gate -> kb chunk ids that support the encoding. Empty = source not ingested. */
  cites: Partial<Record<GateId, string[]>>;
  /** Provisions cited by name whose text is not in kb/chunks.json. */
  notIngested: string[];
  /** Annex III style escalation: when applies(facts) the stricter set below is used. */
  highRisk?: { label: string; applies: (f: HitlFacts) => boolean; gates: GateId[]; capAutonomy: "always"; cites: string[] };
  /** gaps.json ids this jurisdiction's encoding touches. */
  gapIds: string[];
}

export const UAE_FEDERAL: RuleSet = {
  id: "uae-federal",
  name: "UAE federal (reference implementation)",
  gates: ["approved_infrastructure", "audit_log", "data_lawful", "human_final_approval", "ai_disclosure"],
  capAutonomy: "client_facing",
  hitlDefaults: [...HITL_RULE_IDS],
  thresholds: { hallucination_rate_max: 0.05 },
  cites: {
    approved_infrastructure: ["desc-isr-excerpts#0"],
    data_lawful: ["uae-data-protection-laws#4"],
    human_final_approval: ["uae-data-protection-laws#11"],
  },
  notIngested: [],
  gapIds: ["G1", "G5", "G9"],
};

export const EU_AI_ACT: RuleSet = {
  id: "eu-ai-act",
  name: "EU AI Act (deployer view)",
  gates: ["data_lawful", "ai_disclosure"],
  capAutonomy: "client_facing",
  hitlDefaults: [...HITL_RULE_IDS],
  thresholds: {},
  cites: {},
  notIngested: ["Art. 50 transparency duties", "GDPR (incl. Art. 22 automated decisions)", "Art. 15 accuracy"],
  highRisk: {
    label: "Annex III point 5 (essential public services): high-risk",
    applies: (f) => !!f.affects_rights,
    gates: ["data_lawful", "ai_disclosure", "audit_log", "human_final_approval"],
    capAutonomy: "always",
    cites: ["eu-ai-act-articles#7", "eu-ai-act-articles#8", "eu-ai-act-articles#0", "eu-ai-act-articles#2", "eu-ai-act-articles#3", "eu-ai-act-articles#4"],
  },
  gapIds: ["G4", "G7", "G8"],
};

export const SG_IMDA: RuleSet = {
  id: "sg-imda",
  name: "Singapore IMDA agentic AI framework",
  gates: ["audit_log", "data_lawful", "human_final_approval", "hallucination_rate"],
  capAutonomy: "client_facing",
  hitlDefaults: ["client_facing_final_approval", "irreversible_human_approval"],
  thresholds: { human_override_rate_min: 0.02 },
  cites: {
    audit_log: ["sg-imda-agentic-mgf#6"],
    human_final_approval: ["sg-imda-agentic-mgf#2", "sg-imda-agentic-mgf#1"],
    hallucination_rate: ["sg-imda-agentic-mgf#11"],
  },
  notIngested: ["Singapore PDPA"],
  gapIds: ["G2", "G3", "G6"],
};

export const RULESETS: RuleSet[] = [UAE_FEDERAL, EU_AI_ACT, SG_IMDA];
export const DEFAULT_RULESET = UAE_FEDERAL;

/** The effective set for one use case (applies the high-risk escalation, if any). */
export function resolve(rs: RuleSet, facts: HitlFacts): { rs: RuleSet; highRisk: boolean } {
  const h = rs.highRisk;
  if (!h?.applies(facts)) return { rs, highRisk: false };
  return { rs: { ...rs, gates: h.gates, capAutonomy: h.capAutonomy }, highRisk: true };
}

/** Rules a jurisdiction switches off, in HitlConfig shape for hitl.ts. */
export const hitlConfigFor = (rs: RuleSet, entity: string): HitlConfig => ({
  [entity]: HITL_RULE_IDS.filter((r) => !rs.hitlDefaults.includes(r)),
});

/** All chunk ids a rule set cites. */
export const citedChunks = (rs: RuleSet): string[] => [
  ...new Set([...Object.values(rs.cites).flat(), ...(rs.highRisk?.cites ?? [])]),
];

/** Gaps this comparison derives. Not in kb/gaps.json (that file is the curated
 * set); each is marked derived and points at the curated gaps it extends. */
export interface DerivedGap { id: string; derived: true; ruleset: RuleSet["id"]; statement: string; relatesTo: string[]; chunk_ids: string[] }
export const DERIVED_GAPS: DerivedGap[] = [
  { id: "D-EU-1", derived: true, ruleset: "eu-ai-act", statement: "The Art. 86 right to an explanation of the AI system's role in a decision has no gate in the policy engine, so it cannot affect a verdict.", relatesTo: ["G7", "G2"], chunk_ids: ["eu-ai-act-articles#5", "eu-ai-act-articles#6"] },
  { id: "D-EU-2", derived: true, ruleset: "eu-ai-act", statement: "Art. 50 transparency and GDPR Art. 22 are cited by name but not ingested, so the EU encoding of disclosure and lawful processing rests on the existing gates alone.", relatesTo: ["G7", "G8"], chunk_ids: ["eu-ai-act-articles#7"] },
  { id: "D-SG-1", derived: true, ruleset: "sg-imda", statement: "IMDA suggests tracking the human override rate to test whether approvals are meaningful; no gate or threshold here measures it.", relatesTo: ["G2", "G3"], chunk_ids: ["sg-imda-agentic-mgf#3"] },
  { id: "D-SG-2", derived: true, ruleset: "sg-imda", statement: "IMDA itself notes agent identity is not yet handled robustly, so the audit_log gate cannot attribute actions to a specific agent.", relatesTo: ["G1", "G6"], chunk_ids: ["sg-imda-agentic-mgf#4"] },
  { id: "D-UAE-1", derived: true, ruleset: "uae-federal", statement: "Certified hosting (DESC) is a gate only in the UAE set; the EU and Singapore encodings have no equivalent, so a use case can fail on hosting in one and pass in another.", relatesTo: ["G5", "G9"], chunk_ids: ["desc-isr-excerpts#0"] },
];

export interface GateDivergence { gate: GateId; requiredBy: RuleSet["id"][]; notRequiredBy: RuleSet["id"][] }

/** Gates required by some but not all of the given effective sets. */
export function gateDivergence(sets: RuleSet[]): GateDivergence[] {
  const all = [...new Set(sets.flatMap((s) => s.gates))];
  return all
    .filter((g) => sets.some((s) => !s.gates.includes(g)))
    .map((gate) => ({
      gate,
      requiredBy: sets.filter((s) => s.gates.includes(gate)).map((s) => s.id),
      notRequiredBy: sets.filter((s) => !s.gates.includes(gate)).map((s) => s.id),
    }));
}
