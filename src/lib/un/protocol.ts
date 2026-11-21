import type { GateDef } from "./governance.ts";
import type { RuleSet } from "./rulesets.ts";
import { decide, GATES, type Decision, type GateId, type GateState, type GateStatus, type RoleId, type Requested } from "./policy.ts";

// Coordination protocol. Agents exchange typed messages; the coordinator
// applies them to the case state and asks the policy engine for the verdict.
export const MSG_TYPES = [
  "PROPOSE",
  "CHALLENGE",
  "EVIDENCE_REQUEST",
  "EVIDENCE",
  "POSITION_UPDATE",
  "ESCALATE",
  "VERDICT",
] as const;
export type MsgType = (typeof MSG_TYPES)[number];

export interface AgentMessage {
  msg_id: string;
  from: RoleId;
  to: RoleId[];
  type: MsgType;
  /** Use case external id, e.g. UC02. */
  re: string;
  gate?: GateId;
  /** What the sender claims the gate's status now is. */
  status?: GateStatus;
  /** PROPOSE only: autonomy the applicant asks for. */
  requested?: Requested;
  reason: string;
  /** Event ids or external refs that back the claim. */
  evidence: string[];
  /** Knowledge-base chunk ids that back the claim. */
  kb: string[];
  /** Model-written messages only: which model, and the sha256 of the exact prompt (system + user). */
  llm?: LlmProvenance;
}

export interface LlmProvenance {
  model: string;
  prompt_sha256: string;
}

export interface CaseState {
  ext_id: string;
  clientFacing: boolean;
  requested: Requested;
  gates: GateState;
  /** Optional gates this case has taken on (see GATES[].optional). */
  extraGates?: GateId[];
  /** Unmet human-in-the-loop rules (hitl.ts), a hard human_final_approval failure. */
  hitlBreaches?: string[];
  /** Gates this use case adds to its rule set's (gates.ts), the gates waived through governance, and the
   * definitions of admin-added gates this case uses. All optional: absent = today's behaviour. */
  useCaseGates?: GateId[];
  waived?: GateId[];
  customGates?: Record<GateId, GateDef>;
  /** The jurisdiction rule set the verdict is judged under (a country re-run, country.ts). Absent = today's behaviour. Never stored on a run. */
  ruleset?: RuleSet;
}

export interface Rejection {
  msg: AgentMessage;
  why: string;
}

export interface Reconciled {
  state: CaseState;
  accepted: AgentMessage[];
  rejected: Rejection[];
  decision: Decision;
}

/** Why a gate-changing message must be refused, or null if it stands.
 * - only the gate's owner may fail or pass it (mandate);
 * - the applicant (innovator) may only declare a fix;
 * - fail and pass need evidence; any claim needs evidence or a KB citation
 *   ("uncited claims rejected"); cited chunks must exist;
 * - a declared fix must carry an evidence reference that resolves: a knowledge-base chunk
 *   id or the id of a (non-fix) evidence event in this case. Retrieval-attached `kb` ids do
 *   not count, they are not the applicant's reference. Resolving is not the same as
 *   supporting: the reference is not checked to prove the claim. */
export function refusal(m: AgentMessage, hasChunk: (id: string) => boolean, hasEvent: (id: string) => boolean = () => false, customGates?: Record<GateId, GateDef>): string | null {
  const G = customGates ? { ...GATES, ...customGates } : GATES;
  if (m.kb.some((id) => !hasChunk(id))) return "cites a knowledge-base chunk that does not exist";
  if (m.type === "PROPOSE") {
    return m.from === "innovator" && m.requested ? null : "only the innovator proposes, and must state the autonomy requested";
  }
  if (!m.gate || !m.status) return null; // chatter, requests and escalations change no gate
  if (!G[m.gate]) return "unknown gate";
  if (m.status === "fix_declared") {
    if (m.from !== "innovator") return "only the innovator declares a fix";
    if (!m.evidence.length) return "declared fix has no evidence reference (a chunk id or an evidence event id); a bare declaration is not accepted";
    const bad = m.evidence.find((id) => !hasChunk(id) && !hasEvent(id));
    return bad ? `declared fix cites ${bad}, which is neither a knowledge-base chunk nor an evidence event in this case` : null;
  }
  if (!m.evidence.length && !m.kb.length) return "uncited claim: no evidence and no knowledge-base citation";
  if (m.from !== G[m.gate].owner) return `${m.from} does not own gate ${m.gate} (owner: ${G[m.gate].owner})`;
  if (m.status === "pass" && !m.evidence.length) return "a pass needs evidence, not only a policy citation";
  if (m.status === "unknown") return "unknown is not a claim";
  return null;
}

/** Apply a round of messages in order, then ask the policy engine. */
export function reconcile(
  state: CaseState,
  msgs: AgentMessage[],
  hasChunk: (id: string) => boolean,
  hasEvent: (id: string) => boolean = () => false,
): Reconciled {
  const next: CaseState = { ...state, gates: { ...state.gates } };
  const accepted: AgentMessage[] = [];
  const rejected: Rejection[] = [];
  const failedNow = new Set<GateId>();
  for (const m of msgs) {
    if (m.re !== state.ext_id) {
      rejected.push({ msg: m, why: "about a different use case" });
      continue;
    }
    const why = refusal(m, hasChunk, hasEvent, state.customGates);
    if (why) {
      rejected.push({ msg: m, why });
      continue;
    }
    // Contradictory evidence in one round resolves to the stricter state: a fail already set this round is not
    // overridden by a later pass or declared fix (last-write-wins would let message order loosen a verdict).
    if (m.gate && (m.status === "pass" || m.status === "fix_declared") && failedNow.has(m.gate)) {
      rejected.push({ msg: m, why: `conflicts with a fail on ${m.gate} in the same round (the stricter state stands)` });
      continue;
    }
    if (m.gate && m.status === "fail") failedNow.add(m.gate);
    if (m.type === "PROPOSE") next.requested = m.requested!;
    else if (m.gate && m.status) {
      next.gates[m.gate] = m.status;
      if ((state.customGates?.[m.gate] ?? GATES[m.gate]).optional && !next.extraGates?.includes(m.gate)) next.extraGates = [...(next.extraGates ?? []), m.gate];
    }
    accepted.push(m);
  }
  return {
    state: next,
    accepted,
    rejected,
    decision: decide({ ruleset: state.ruleset, clientFacing: next.clientFacing, requested: next.requested, gates: next.gates, extraGates: next.extraGates, hitlBreaches: next.hitlBreaches, useCaseGates: next.useCaseGates, waived: next.waived, catalog: state.customGates ? { ...GATES, ...state.customGates } : undefined }),
  };
}

/** Each agent sees only messages addressed to it (or sent by it). */
export const inbox = (msgs: AgentMessage[], role: RoleId) =>
  msgs.filter((m) => m.from === role || m.to.includes(role));
