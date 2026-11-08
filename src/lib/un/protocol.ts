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
 *   ("uncited claims rejected"); cited chunks must exist. */
export function refusal(m: AgentMessage, hasChunk: (id: string) => boolean): string | null {
  if (m.kb.some((id) => !hasChunk(id))) return "cites a knowledge-base chunk that does not exist";
  if (m.type === "PROPOSE") {
    return m.from === "innovator" && m.requested ? null : "only the innovator proposes, and must state the autonomy requested";
  }
  if (!m.gate || !m.status) return null; // chatter, requests and escalations change no gate
  if (!GATES[m.gate]) return "unknown gate";
  if (!m.evidence.length && !m.kb.length) return "uncited claim: no evidence and no knowledge-base citation";
  if (m.status === "fix_declared") {
    return m.from === "innovator" ? null : "only the innovator declares a fix";
  }
  if (m.from !== GATES[m.gate].owner) return `${m.from} does not own gate ${m.gate} (owner: ${GATES[m.gate].owner})`;
  if (m.status === "pass" && !m.evidence.length) return "a pass needs evidence, not only a policy citation";
  if (m.status === "unknown") return "unknown is not a claim";
  return null;
}

/** Apply a round of messages in order, then ask the policy engine. */
export function reconcile(
  state: CaseState,
  msgs: AgentMessage[],
  hasChunk: (id: string) => boolean,
): Reconciled {
  const next: CaseState = { ...state, gates: { ...state.gates } };
  const accepted: AgentMessage[] = [];
  const rejected: Rejection[] = [];
  for (const m of msgs) {
    if (m.re !== state.ext_id) {
      rejected.push({ msg: m, why: "about a different use case" });
      continue;
    }
    const why = refusal(m, hasChunk);
    if (why) {
      rejected.push({ msg: m, why });
      continue;
    }
    if (m.type === "PROPOSE") next.requested = m.requested!;
    else if (m.gate && m.status) {
      next.gates[m.gate] = m.status;
      if (GATES[m.gate].optional && !next.extraGates?.includes(m.gate)) next.extraGates = [...(next.extraGates ?? []), m.gate];
    }
    accepted.push(m);
  }
  return {
    state: next,
    accepted,
    rejected,
    decision: decide({ clientFacing: next.clientFacing, requested: next.requested, gates: next.gates, extraGates: next.extraGates, hitlBreaches: next.hitlBreaches }),
  };
}

/** Each agent sees only messages addressed to it (or sent by it). */
export const inbox = (msgs: AgentMessage[], role: RoleId) =>
  msgs.filter((m) => m.from === role || m.to.includes(role));
