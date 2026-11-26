import type { RoleId } from "./authz.ts";

// RACI for the process, and how an event is routed to people. Pure: no I/O.
//   R  Responsible: does the work. The person's agent takes it first.
//   A  Accountable: signs off. Always a person (a human-only decision), tagged for human review.
//   C  Consulted: asked for input before a decision. The agent drafts the answer with the context; a person sends it.
//   I  Informed: told. A read-only notice, tagged for the person.
//   AR both (one person does the work and answers for it).
// The defaults below come from the roles. They can be overridden for one person on one use case (an override row), and a matrix is checked: every step needs
// someone Responsible and exactly one Accountable.

export type Letter = "R" | "A" | "C" | "I" | "AR";
export type Position = "owner" | "operator" | "entity_admin" | "governance_admin" | "platform";

/** The steps of the process an event belongs to. */
export const STEPS = ["people", "sop_setup", "targets", "tests", "pilot", "approval", "deploy", "monitor", "governance"] as const;
export type Step = (typeof STEPS)[number];

export const STEP_LABELS: Record<Step, string> = {
  people: "Missing people and positions",
  sop_setup: "SOP and job profiles",
  targets: "Process targets",
  tests: "Test set and verdict parameters",
  pilot: "Pilot and goal judgments",
  approval: "Approval of the agent version",
  deploy: "Deployment",
  monitor: "Production monitoring",
  governance: "Governance of a country",
};

/** The defaults. Targets and tests are proposed by the business owner and approved by the governance admin; the entity admin owns setup and people. */
export const DEFAULT_RACI: Record<Step, Record<Position, Letter | null>> = {
  // a missing position concerns the entity admin (to act) and the platform admin (to know); null = not involved
  people:     { owner: null, operator: null, entity_admin: "AR", governance_admin: null, platform: "I" },
  sop_setup:  { owner: "C", operator: "I", entity_admin: "AR", governance_admin: "I", platform: "I" },
  targets:    { owner: "R", operator: "C", entity_admin: "C", governance_admin: "A", platform: "I" },
  tests:      { owner: "R", operator: "C", entity_admin: "I", governance_admin: "A", platform: "I" },
  pilot:      { owner: "A", operator: "R", entity_admin: "I", governance_admin: "C", platform: "I" },
  approval:   { owner: "A", operator: "R", entity_admin: "I", governance_admin: "I", platform: "I" },
  deploy:     { owner: "A", operator: "R", entity_admin: "I", governance_admin: "I", platform: "I" },
  monitor:    { owner: "A", operator: "R", entity_admin: "I", governance_admin: "I", platform: "I" },
  governance: { owner: null, operator: null, entity_admin: null, governance_admin: null, platform: "AR" },
};

export const POSITIONS: readonly Position[] = ["owner", "operator", "entity_admin", "governance_admin", "platform"];

/** The position a role plays in the process. A test author has none (they are consulted only by an override). */
export const positionOfRole = (role: RoleId): Position | null =>
  role === "process_owner" ? "owner" : role === "operator" ? "operator" : role === "entity_admin" ? "entity_admin" : role === "governance_admin" ? "governance_admin" : role === "platform_admin" ? "platform" : null;

/** A matrix is valid when every step has someone Responsible and exactly one Accountable (AR counts as both). Returns the problems. */
export function validateRaci(m: Record<Step, Record<string, Letter | null>>): string[] {
  const problems: string[] = [];
  for (const step of STEPS) {
    const row = Object.values(m[step] ?? {});
    const a = row.filter((l) => l === "A" || l === "AR").length;
    const r = row.filter((l) => l === "R" || l === "AR").length;
    if (r < 1) problems.push(`${STEP_LABELS[step]}: nobody is Responsible`);
    if (a !== 1) problems.push(`${STEP_LABELS[step]}: ${a === 0 ? "nobody is" : `${a} people are`} Accountable (exactly one is needed)`);
  }
  return problems;
}

/** What an item asks of its recipient. */
export type Mode = "action" | "approval" | "consult" | "inform";
export const modeOf = (l: Letter): Mode => (l === "I" ? "inform" : l === "C" ? "consult" : l === "A" ? "approval" : "action");

/** Explicit decisions: they need a person's input and are never taken by an agent. Always tagged for human review. */
export const HUMAN_DECISIONS = ["targets.approve", "tests.approve", "version.approve", "verdict.sign", "deploy", "gate.waive", "gate.accept", "goals.approve", "rerun.request", "tuning.decide", "reinstate"] as const;
export type Decision = (typeof HUMAN_DECISIONS)[number];
export const isHumanDecision = (kind: string): boolean => (HUMAN_DECISIONS as readonly string[]).includes(kind);

export interface Holder { user_id: string; positions: Position[] }
export interface Recipient { user_id: string; letter: Letter; escalated_from?: Position }

/**
 * Who receives an event of this step. Each holder gets the letter of their strongest position (a person who is Responsible and also Informed is Responsible).
 * An override (user_id, step -> letter) replaces the default for that person. If nobody holds a position that is Responsible, or nobody holds the position
 * that is Accountable (for targets and test sets, the governance admin of the country), the item goes to the platform holders as an action (and
 * `escalated_from` says whose it was), so a request is never left with no one.
 */
const RANK: Record<Letter, number> = { AR: 5, R: 4, A: 3, C: 2, I: 1 };

/** The letter a position gives by default for a step (the strongest, when a person holds several positions), or null when they are not involved. */
export const defaultLetter = (step: Step, positions: Position[]): Letter | null =>
  positions.map((p) => DEFAULT_RACI[step][p]).filter((l): l is Letter => l !== null).sort((a, b) => RANK[b] - RANK[a])[0] ?? null;

/** Each person's letter for a step: an override replaces the default, and an override can bring in a person who holds no position here (a test author who is
 * consulted, say). Before any escalation. */
export function effectiveLetters(step: Step, holders: Holder[], overrides: { user_id: string; letter: Letter }[] = []): Map<string, Letter> {
  const out = new Map<string, Letter>();
  for (const h of holders) {
    const letter = overrides.find((o) => o.user_id === h.user_id)?.letter ?? defaultLetter(step, h.positions);
    if (letter) out.set(h.user_id, letter);
  }
  for (const o of overrides) if (!out.has(o.user_id)) out.set(o.user_id, o.letter);
  return out;
}

/** Would this override leave the step sensible? Every step needs someone Responsible and an Accountable, and a second Accountable is refused (exactly one
 * answers for a step). Returns the problem, or null. */
export function checkOverride(step: Step, holders: Holder[], overrides: { user_id: string; letter: Letter }[], next: { user_id: string; letter: Letter }): string | null {
  const before = effectiveLetters(step, holders, overrides.filter((o) => o.user_id !== next.user_id));
  const after = effectiveLetters(step, holders, [...overrides.filter((o) => o.user_id !== next.user_id), next]);
  const count = (m: Map<string, Letter>, want: (l: Letter) => boolean) => [...m.values()].filter(want).length;
  const acc = (l: Letter) => l === "A" || l === "AR";
  const resp = (l: Letter) => l === "R" || l === "AR";
  if (acc(next.letter) && count(before, acc) >= 1) return `${STEP_LABELS[step]} already has someone Accountable: give that person another letter first, so exactly one answers for it`;
  if (count(after, acc) < 1) return `${STEP_LABELS[step]} would have nobody Accountable`;
  if (count(after, resp) < 1) return `${STEP_LABELS[step]} would have nobody Responsible`;
  return null;
}

export function route(step: Step, holders: Holder[], overrides: { user_id: string; letter: Letter }[] = []): Recipient[] {
  const out = new Map<string, Recipient>([...effectiveLetters(step, holders, overrides)].map(([user_id, letter]) => [user_id, { user_id, letter }]));
  const covered = (want: (l: Letter) => boolean) => [...out.values()].some((r) => want(r.letter));
  const held = (p: Position) => holders.some((h) => h.positions.includes(p));
  const needs = POSITIONS.filter((p) => DEFAULT_RACI[step][p] === "AR" || DEFAULT_RACI[step][p] === "R");
  const accountable = POSITIONS.filter((p) => DEFAULT_RACI[step][p] === "A" || DEFAULT_RACI[step][p] === "AR");
  const noResponsible = !covered((l) => l === "R" || l === "AR") || (needs.length > 0 && !needs.some(held));
  const noAccountable = accountable.length > 0 && !accountable.some(held);
  if (noResponsible || noAccountable) {
    const missing = noAccountable ? accountable[0] : needs[0];
    for (const h of holders.filter((x) => x.positions.includes("platform"))) {
      const cur = out.get(h.user_id);
      if (!cur || (cur.letter !== "AR" && cur.letter !== "R")) out.set(h.user_id, { user_id: h.user_id, letter: "AR", escalated_from: missing });
    }
  }
  return [...out.values()];
}
