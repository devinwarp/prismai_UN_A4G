import type { UnUseCase } from "./model.ts";

// Per-entity human-in-the-loop rules. Pure: no I/O. An entity may switch a
// rule off only by saving that choice; the default is every rule on. A rule
// that applies to a use case and is declared unmet is a hard failure of the
// human_final_approval gate (see decide() in policy.ts), never averaged.
export const HITL_RULES = {
  client_facing_final_approval: {
    label: "Client-facing or external output needs a person's final approval",
    applies: (u: HitlFacts) => u.client_facing,
  },
  rights_or_fees_human_decision: {
    label: "Decisions affecting rights or fees need a human decision",
    applies: (u: HitlFacts) => !!u.affects_rights,
  },
  irreversible_human_approval: {
    label: "Irreversible actions need human approval",
    applies: (u: HitlFacts) => !!u.irreversible,
  },
} as const;

export type HitlRuleId = keyof typeof HITL_RULES;
export const HITL_RULE_IDS = Object.keys(HITL_RULES) as HitlRuleId[];
export const isHitlRule = (x: unknown): x is HitlRuleId => typeof x === "string" && x in HITL_RULES;

export type HitlFacts = Pick<UnUseCase, "client_facing" | "affects_rights" | "irreversible">;

/** entity -> rules explicitly switched off. Absent entity = all rules on. */
export type HitlConfig = Record<string, HitlRuleId[]>;

/** Rules in force for a use case: enabled for its entity and triggered by its facts. */
export function applicableRules(config: HitlConfig, entity: string, facts: HitlFacts): HitlRuleId[] {
  const off = config[entity] ?? [];
  return HITL_RULE_IDS.filter((r) => !off.includes(r) && HITL_RULES[r].applies(facts));
}

/** Applicable rules the use case declares unmet. Pass the result to decide()
 * as hitlBreaches: any entry is a hard human_final_approval failure. */
export function hitlBreaches(config: HitlConfig, entity: string, facts: HitlFacts, unmet: HitlRuleId[]): HitlRuleId[] {
  const live = applicableRules(config, entity, facts);
  return unmet.filter((r) => live.includes(r));
}
