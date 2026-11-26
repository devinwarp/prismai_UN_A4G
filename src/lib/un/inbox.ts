import { isHumanDecision, modeOf, type Letter, type Mode } from "./raci.ts";

// The inbox: what an item is, who handles it (an agent or a person), how it moves, and when an unanswered one escalates. Pure: no I/O.

export type Handler = "agent" | "human";
export type Status = "open" | "agent_working" | "done" | "blocked_human" | "dismissed";

export interface InboxItem {
  id: string;
  org_id: string;
  created_at: string;
  /** what happened: "people.position_missing", "targets.approve", "info.deployed", ... */
  kind: string;
  mode: Mode;
  letter: Letter;
  handler: Handler;
  status: Status;
  user_id: string;
  subject: string;
  body: string;
  entity: string | null;
  country: string | null;
  use_case_id: string | null;
  link: string | null;
  payload: Record<string, unknown>;
  /** one open item per (user, dedupe key): the same event does not pile up */
  dedupe_key: string;
  attempts: number;
  /** why an agent was stopped: the permission or rule that refused it, for the person who must act */
  blocked_reason: string | null;
  escalate_at: string | null;
  /** set when the item was handed one level up because nobody dealt with it in time */
  escalated_at: string | null;
  /** the item a person's was escalated from, or the position whose work this is when nobody held it */
  escalated_from: string | null;
  read_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_by: string;
}

export type NewItem = Pick<InboxItem, "kind" | "user_id" | "subject" | "body" | "letter" | "dedupe_key"> & Partial<Pick<InboxItem, "entity" | "country" | "use_case_id" | "link" | "payload" | "escalated_from" | "created_by">>;

/** Who handles a new item first. Information is for a person. An explicit decision is for a person, always. A consult is drafted by the agent and sent by
 * a person (so it starts with the agent and ends with a person). Responsible work starts with the agent. */
export function handlerFor(kind: string, letter: Letter): Handler {
  const mode = modeOf(letter);
  if (mode === "inform" || mode === "approval" || isHumanDecision(kind)) return "human";
  return "agent";
}

export const MAX_ATTEMPTS = 3;

/** Working days (Monday to Friday) after `from`. */
export function addWorkingDays(from: Date, days: number): Date {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) left--;
  }
  return d;
}

/** An item that needs a person escalates after two working days if it is still open. Information never escalates. */
export const ESCALATE_AFTER_WORKING_DAYS = 2;
export const escalateAtFor = (mode: Mode, from: Date): string | null => (mode === "inform" ? null : addWorkingDays(from, ESCALATE_AFTER_WORKING_DAYS).toISOString());

export function newItem(n: NewItem, o: { org_id: string; id: string; now: Date }): InboxItem {
  const mode = modeOf(n.letter);
  const handler = handlerFor(n.kind, n.letter);
  return {
    id: o.id, org_id: o.org_id, created_at: o.now.toISOString(), kind: n.kind, mode, letter: n.letter, handler, status: "open", user_id: n.user_id,
    subject: n.subject, body: n.body, entity: n.entity ?? null, country: n.country ?? null, use_case_id: n.use_case_id ?? null, link: n.link ?? null,
    payload: n.payload ?? {}, dedupe_key: n.dedupe_key, attempts: 0, blocked_reason: null,
    // an item an agent will work on first does not start its escalation clock until a person must act
    escalate_at: handler === "human" ? escalateAtFor(mode, o.now) : null,
    escalated_at: null, escalated_from: n.escalated_from ?? null, read_at: null, resolved_at: null, resolved_by: null, created_by: n.created_by ?? "system",
  };
}

/** The agent could not do it: the item goes to the person, with the reason, and their escalation clock starts. */
export function blockToHuman(item: InboxItem, reason: string, now: Date): InboxItem {
  return { ...item, handler: "human", status: "blocked_human", blocked_reason: reason, attempts: item.attempts + 1, escalate_at: escalateAtFor(item.mode, now) };
}

/** An agent attempt that did not finish, with attempts left; at the limit it is handed to the person. */
export function failAttempt(item: InboxItem, reason: string, now: Date): InboxItem {
  return item.attempts + 1 >= MAX_ATTEMPTS ? blockToHuman(item, `${reason} (after ${item.attempts + 1} attempts)`, now) : { ...item, attempts: item.attempts + 1, status: "open", blocked_reason: reason };
}

export const isOpen = (i: InboxItem) => i.status === "open" || i.status === "agent_working" || i.status === "blocked_human";

/** Items whose escalation time has passed and that a person still has not dealt with, each to be handed one level up. */
export const dueForEscalation = (items: InboxItem[], now: Date): InboxItem[] =>
  items.filter((i) => isOpen(i) && i.handler === "human" && !!i.escalate_at && i.escalate_at <= now.toISOString() && !i.escalated_at);

/** What needs the person now: open items they must act on (an action, an approval or a consult), information they have not read, and what their agent is on. */
export function countsOf(items: InboxItem[]) {
  const open = items.filter(isOpen);
  return {
    todo: open.filter((i) => i.handler === "human" && i.mode !== "inform").length,
    info: open.filter((i) => i.mode === "inform" && !i.read_at).length,
    agent: open.filter((i) => i.handler === "agent").length,
  };
}
