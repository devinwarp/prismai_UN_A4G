import { excerpt, supportingChunks, type Chunk, type Hit } from "./kb.ts";
import { GATES, type GateId, type GateStatus, type RoleId } from "./policy.ts";
import { ROLES, type RoleDef } from "./roles.ts";
import { MSG_TYPES, inbox, type AgentMessage, type MsgType } from "./protocol.ts";

export { ROLES, type RoleDef };

/** An event as an agent receives it. The scenario engine decides who gets
 * which event; an agent never sees events routed elsewhere. */
export interface AgentEvent {
  id: string;
  type: string;
  summary: string;
  /** Gate this event is evidence about, and what it shows. */
  gate?: GateId;
  status?: GateStatus;
  /** Earlier event ids this one connects to (the recipient saw them). Added to the claim's evidence. */
  links?: string[];
}

export interface AgentContext {
  ext_id: string;
  title: string;
  clientFacing: boolean;
  /** Events routed to this agent, and only these. */
  events: AgentEvent[];
  /** Earlier messages (filtered to this agent's inbox before use). */
  thread: AgentMessage[];
  /** Applicant's requested autonomy, for the innovator's PROPOSE. */
  requested?: "GO_AUTONOMOUS" | "GO_SUPERVISED" | "ASSISTANT_ONLY";
}

export interface AgentDeps {
  search: (query: string) => Hit[];
  /** Returns the model's raw text (JSON). Omit for deterministic mode. */
  llm?: (system: string, user: string) => Promise<string>;
  nextId: () => string;
}

const ALL: RoleId[] = ["coordinator"];
/** A failed gate affects the applicant, the policy adviser and (for a
 * client-facing case) the frontline, so a CHALLENGE is addressed to them as
 * well as to the coordinator (C2-1). */
export const affectedBy = (from: RoleId, clientFacing: boolean): RoleId[] =>
  (["innovator", "policy_adviser", ...(clientFacing ? (["frontline"] as RoleId[]) : [])] as RoleId[]).filter((r) => r !== from);

/** Deterministic mode: an event about a gate this role owns becomes a
 * CHALLENGE (fail) or EVIDENCE (pass) message citing the event and the best
 * mandate-relevant chunk. The innovator turns fix events into declared fixes. */
function ruleBased(role: RoleId, ctx: AgentContext, deps: AgentDeps, kb: string[]): AgentMessage[] {
  const out: AgentMessage[] = [];
  const base = { from: role, to: ALL, re: ctx.ext_id, kb };
  if (role === "innovator" && ctx.requested && !ctx.thread.some((m) => m.type === "PROPOSE")) {
    out.push({ ...base, msg_id: deps.nextId(), type: "PROPOSE", requested: ctx.requested,
      reason: `Requesting ${ctx.requested} for ${ctx.title}`, evidence: [], kb: [] });
  }
  for (const e of ctx.events) {
    if (!e.gate && role !== "innovator" && role !== "coordinator") {
      // Context without a gate: the role puts what it saw on the record, cited. It changes no gate.
      out.push({ ...base, msg_id: deps.nextId(), type: "EVIDENCE", reason: e.summary, evidence: [e.id] });
    }
    if (!e.gate || !e.status) continue;
    if (role === "innovator" && e.status === "fix_declared") {
      out.push({ ...base, msg_id: deps.nextId(), type: "POSITION_UPDATE", gate: e.gate, status: "fix_declared",
        reason: e.summary, evidence: [e.id] });
    } else if (ROLES[role].gates.includes(e.gate) && e.status !== "fix_declared") {
      const challenge = e.status === "fail";
      out.push({ ...base, to: challenge ? [...ALL, ...affectedBy(role, ctx.clientFacing)] : ALL, msg_id: deps.nextId(), type: challenge ? "CHALLENGE" : "EVIDENCE",
        gate: e.gate, status: e.status, reason: e.summary, evidence: [e.id, ...(e.links ?? [])] });
    }
  }
  return out;
}

const SYSTEM = (role: RoleId) => `You are the ${ROLES[role].label} agent in a government AI-approval process.
Mandate: ${ROLES[role].mandate}
You may only fail or pass these gates: ${ROLES[role].gates.join(", ") || "(none)"}.
Reply with JSON: {"messages":[{"type":one of ${MSG_TYPES.join("|")},"gate":optional gate id,"status":optional "fail"|"pass"|"fix_declared","reason":"one or two sentences","evidence":["event ids you were shown"],"kb":["chunk ids you were shown"]}]}
Rules: cite only event ids and chunk ids you were given. Never claim anything about events you were not shown. A pass needs an event as evidence. No message if nothing in your mandate is affected.
Gates: ${Object.entries(GATES).map(([k, g]) => `${k} (${g.label})`).join("; ")}.`;

/** One agent turn. Falls back to deterministic mode if the model call or its
 * JSON fails, so a flaky model never blocks the process. */
export async function runAgent(role: RoleId, ctx: AgentContext, deps: AgentDeps): Promise<AgentMessage[]> {
  const mine = inbox(ctx.thread, role);
  // Gate events search by what that gate is about; advisory roles by their mandate.
  const gateQ = [...new Set(ctx.events.flatMap((e) => (e.gate && GATES[e.gate] ? [GATES[e.gate].kbQuery] : [])))];
  const query = `${gateQ.length ? gateQ.join(" ") : ROLES[role].kbQuery} ${ctx.events.map((e) => e.summary).join(" ")}`;
  const hits = deps.search(query).slice(0, 6);
  const kb = supportingChunks(hits, query).map((c) => c.chunk_id);
  const det = ruleBased(role, { ...ctx, thread: mine }, deps, kb);
  if (!deps.llm) return det;
  const user = JSON.stringify({
    use_case: { id: ctx.ext_id, title: ctx.title, client_facing: ctx.clientFacing },
    events_you_received: ctx.events,
    messages_to_you: mine,
    knowledge_base: hits.map((h) => ({ chunk_id: h.chunk.chunk_id, source: h.chunk.title, quote: excerpt(h.chunk.text, query) })),
  });
  try {
    const raw = JSON.parse((await deps.llm(SYSTEM(role), user)).replace(/^```(?:json)?|```$/g, "").trim()) as { messages?: Partial<AgentMessage>[] };
    const known = new Set([...ctx.events.map((e) => e.id), ...mine.map((m) => m.msg_id)]);
    const msgs = (raw.messages ?? []).filter((m) => MSG_TYPES.includes(m.type as MsgType)).map((m) => ({
      msg_id: deps.nextId(), from: role, to: ALL, re: ctx.ext_id, type: m.type as MsgType,
      gate: m.gate && GATES[m.gate] ? m.gate : undefined, status: m.status, reason: String(m.reason ?? "").slice(0, 600),
      evidence: (m.evidence ?? []).filter((id) => known.has(id)), kb: (m.kb ?? []).filter((id) => hits.some((h) => h.chunk.chunk_id === id)),
    }));
    // The model may only add to what the rules already established, never contradict it.
    return [...det, ...msgs.filter((m) => !det.some((d) => d.gate && d.gate === m.gate))];
  } catch {
    return det;
  }
}

export type { Chunk };
