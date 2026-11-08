import { runAgent, ROLES, type AgentDeps, type AgentEvent } from "./agents.ts";
import type { HitlRuleId } from "./hitl.ts";
import { applicableGates, GATES, type GateId, type RoleId } from "./policy.ts";
import { reconcile, type AgentMessage, type CaseState, type Reconciled } from "./protocol.ts";

/** An event plus who receives it. Uneven distribution is the point: an agent
 * never sees an event that was not routed to it. */
export interface RoutedEvent extends AgentEvent {
  recipients: RoleId[];
  /** A human-in-the-loop rule this event shows unmet (met: false) or restored
   * (met: true). Applied by the coordinator, not by an agent (I-2). */
  hitl?: { rule: HitlRuleId; met: boolean };
}

export interface RoundInput {
  state: CaseState;
  title: string;
  requested?: CaseState["requested"];
  thread: AgentMessage[];
  events: RoutedEvent[];
}

export interface RoundResult extends Reconciled {
  /** Roles that ran this round (those that received an event). */
  active: RoleId[];
  /** thread + this round's accepted messages + the VERDICT message. */
  thread: AgentMessage[];
}

const ORDER: RoleId[] = ["innovator", "policy_adviser", "security", "privacy", "compliance", "frontline", "finance"];

const gateName = (g: GateId) => GATES[g].label.toLowerCase();

/** The coordinator's own protocol moves for this round (C2-1). None of them
 * changes a gate, so the policy engine's verdict is unaffected:
 * - a gate with no evidence yet is requested from its owner (EVIDENCE_REQUEST)
 *   once, and the owner answers EVIDENCE without a status ("unknown");
 * - a failed gate the applicant has not yet answered gets a POSITION_UPDATE
 *   acknowledging the CHALLENGE (the CHALLENGE itself is already addressed to
 *   the affected roles by the agent that raised it);
 * - two or more gates failing and unresolved are referred to the human
 *   (ESCALATE), once for each such set. */
export function coordinate(state: CaseState, thread: AgentMessage[], round: AgentMessage[], nextId: () => string): AgentMessage[] {
  const out: AgentMessage[] = [];
  const re = state.ext_id;
  const seen = [...thread, ...round];
  const ids = applicableGates(state.clientFacing, state.extraGates);
  for (const g of ids) {
    const status = state.gates[g] ?? "unknown";
    const owner = GATES[g].owner;
    if (status === "unknown" && !seen.some((m) => m.type === "EVIDENCE_REQUEST" && m.gate === g)) {
      const req: AgentMessage = { msg_id: nextId(), from: "coordinator", to: [owner], type: "EVIDENCE_REQUEST", re, gate: g,
        reason: `No evidence yet for: ${gateName(g)}. ${ROLES[owner].label}, please provide it or say it is not available.`, evidence: [], kb: [] };
      out.push(req, { msg_id: nextId(), from: owner, to: ["coordinator"], type: "EVIDENCE", re, gate: g,
        reason: `Not available yet: no evidence for ${gateName(g)} has reached ${ROLES[owner].label}.`, evidence: [], kb: [] });
    }
    if (status === "fail" && round.some((m) => m.type === "CHALLENGE" && m.gate === g)
      && !seen.some((m) => m.from === "innovator" && m.type === "POSITION_UPDATE" && m.gate === g && !m.status)) {
      out.push({ msg_id: nextId(), from: "innovator", to: ["coordinator"], type: "POSITION_UPDATE", re, gate: g,
        reason: `Acknowledged the challenge on ${gateName(g)}. The entity will remediate and declare the fix for re-test.`, evidence: [], kb: [] });
    }
  }
  const failed = ids.filter((g) => state.gates[g] === "fail").sort();
  if (failed.length >= 2) {
    const key = failed.join(",");
    if (!seen.some((m) => m.type === "ESCALATE" && m.reason.includes(`[${key}]`))) {
      out.push({ msg_id: nextId(), from: "coordinator", to: [], type: "ESCALATE", re,
        reason: `Unresolved conflicts [${key}]: ${failed.map(gateName).join("; ")}. Referred to a human decision-maker.`, evidence: [], kb: [] });
    }
  }
  return out;
}

/** One coordinator round: each recipient runs on its own events (fixed order,
 * so message ids are stable), the coordinator applies the messages, the
 * policy engine decides, and a VERDICT message records why. */
export async function runRound(input: RoundInput, deps: AgentDeps, hasChunk: (id: string) => boolean): Promise<RoundResult> {
  const active = ORDER.filter((r) => input.events.some((e) => e.recipients.includes(r)));
  const msgs: AgentMessage[] = [];
  for (const role of active) {
    const events = input.events
      .filter((e) => e.recipients.includes(role))
      .map((e) => ({ id: e.id, type: e.type, summary: e.summary, gate: e.gate, status: e.status, links: e.links }));
    msgs.push(
      ...(await runAgent(
        role,
        {
          ext_id: input.state.ext_id,
          title: input.title,
          clientFacing: input.state.clientFacing,
          events,
          thread: input.thread,
          requested: role === "innovator" ? input.requested : undefined,
        },
        deps,
      )),
    );
  }
  const first = reconcile(input.state, msgs, hasChunk);
  const extra = coordinate(first.state, input.thread, first.accepted, deps.nextId);
  const r = extra.length ? reconcile(input.state, [...msgs, ...extra], hasChunk) : first;
  const verdict: AgentMessage = {
    msg_id: deps.nextId(),
    from: "coordinator",
    to: [],
    type: "VERDICT",
    re: input.state.ext_id,
    reason: `${r.decision.verdict}: ${r.decision.reasons.join("; ")}`,
    evidence: r.accepted.map((m) => m.msg_id),
    kb: [],
  };
  return { ...r, active, thread: [...input.thread, ...r.accepted, verdict] };
}
