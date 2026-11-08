import type { RoleId } from "./policy.ts";
import type { StepResult } from "./scenario.ts";

// Per-agent "what I know" view (C2-2). Events are released to only some of the
// agents; this derives, for each agent and each released step, the events it
// has received, the running total it knows, and the events it never saw.
// Pure: it reads the step results already stored in a run.

export interface KnownEvent {
  id: string;
  step: string;
  summary: string;
  gate?: string;
  status?: string;
}

export interface AgentKnowledge {
  role: RoleId;
  /** Events received at each step (index = step position); [] when none arrived. */
  received: KnownEvent[][];
  /** Everything received so far, in order. */
  knows: KnownEvent[];
  /** Events released so far that were never routed to this agent. */
  unaware: KnownEvent[];
}

const ORDER: RoleId[] = ["innovator", "policy_adviser", "security", "privacy", "compliance", "frontline", "finance", "coordinator"];

export function knowledgeByAgent(steps: Pick<StepResult, "step" | "events">[]): AgentKnowledge[] {
  const all: KnownEvent[] = steps.flatMap((s) => s.events.map((e) => ({ id: e.id, step: s.step, summary: e.summary, gate: e.gate, status: e.status })));
  const roles = ORDER.filter((r) => steps.some((s) => s.events.some((e) => e.recipients.includes(r))));
  return roles.map((role) => {
    const received = steps.map((s) =>
      s.events.filter((e) => e.recipients.includes(role)).map((e) => ({ id: e.id, step: s.step, summary: e.summary, gate: e.gate, status: e.status })),
    );
    const knows = received.flat();
    const have = new Set(knows.map((e) => e.id));
    return { role, received, knows, unaware: all.filter((e) => !have.has(e.id)) };
  });
}
