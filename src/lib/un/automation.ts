// Who is doing the work on a use case. Pure: no I/O.
//   human           nobody has ticked a job profile for automation: people do the work today
//   agent_progress  at least one job profile is ticked for automation and the agent is not in production yet
//   agent_done      the agent has been deployed to production
// The same three states are shown by the work icon in the use-case register, and the same icons tag an inbox item as handled by a person or an agent.

export type Automation = "human" | "agent_progress" | "agent_done";

export const AUTOMATION_STATES: readonly Automation[] = ["human", "agent_progress", "agent_done"];

export function automationOf(o: { ticked: number; deployed: boolean }): Automation {
  if (o.deployed) return "agent_done";
  return o.ticked > 0 ? "agent_progress" : "human";
}
