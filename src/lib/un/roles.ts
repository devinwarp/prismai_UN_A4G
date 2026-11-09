import type { GateId, RoleId } from "./policy.ts";

// Role definitions, kept apart from agents.ts so client components can read the
// labels and mandates without pulling in the knowledge-base loader (node:fs).
export interface RoleDef {
  label: string;
  mandate: string;
  /** Gates this role may fail or pass. */
  gates: GateId[];
  /** Seeds retrieval so the role cites sources from its own mandate. */
  kbQuery: string;
}

export const ROLES: Record<RoleId, RoleDef> = {
  innovator: {
    label: "Innovator (applicant)",
    mandate: "Represents the entity proposing the use case. Proposes the autonomy level and declares fixes; cannot pass or fail gates.",
    gates: [],
    kbQuery: "AI integration matrix agents quadrants benefits",
  },
  policy_adviser: {
    label: "Policy & legal adviser",
    mandate: "Maps the use case to UAE, Dubai and global obligations and surfaces requirements others may miss. Advises; owns no gate.",
    gates: [],
    kbQuery: "agentic AI governance human oversight accountability high-risk public services",
  },
  security: {
    label: "Security (institutional)",
    mandate: "Hosting, access, logging and adversarial robustness.",
    gates: ["approved_infrastructure", "audit_log"],
    kbQuery: "cyber security artificial intelligence hosting infrastructure human oversight override",
  },
  privacy: {
    label: "Privacy / legal",
    mandate: "Data minimisation, lawful use and redaction.",
    gates: ["data_lawful", "purpose_limitation"],
    kbQuery: "personal data protection lawful processing privacy",
  },
  compliance: {
    label: "Compliance",
    mandate: "Human-in-the-loop rules, transparency to citizens and attestation.",
    gates: ["human_final_approval", "ai_disclosure", "hallucination_rate", "fee_accuracy", "no_commercial_promotion"],
    kbQuery: "human oversight transparency inform users interacting with AI accountability",
  },
  frontline: {
    label: "Frontline representative",
    mandate: "Workability, exceptions and officer workload. Advises; owns no gate.",
    gates: [],
    kbQuery: "service delivery staff workload exceptions escalation",
  },
  finance: {
    label: "Finance",
    mandate: "Net value and cost to run. Advises; owns no gate.",
    gates: [],
    kbQuery: "cost benefit value measurement",
  },
  coordinator: {
    label: "Coordinator",
    mandate: "Runs the protocol: collects proposals and challenges and requests evidence. The verdict comes from the policy engine, not from this role.",
    gates: [],
    kbQuery: "governance accountability",
  },
};
