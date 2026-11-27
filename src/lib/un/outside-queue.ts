import { isOrgAdmin } from "../roles.ts";
import { CaseMemory, type MemoryStore } from "./case-memory.ts";
import type { OutsideRequest } from "./react-sop.ts";

// The outside-information request queue. The agent's required tool request_outside_information lands
// here as an open row. A person with the admin role answers it; the answer is appended to the case's
// hash-chained memory with the answerer's role, and the next session of the agent finds it there and
// resumes without searching or asking again. A viewer can read the queue and nothing else.
// Pure over a minimal table client, so tests run against the offline store and the app against Supabase.

export interface OutsideRow {
  id: string;
  org_id: string;
  case_id: string;
  sop_id: string;
  profile: string;
  question: string;
  reason: string;
  tried: string[];
  status: "open" | "answered";
  created_at: string;
  answered_at?: string | null;
  answered_by?: string | null;
  answered_role?: string | null;
  answer?: string | null;
  memory_hash?: string | null;
}

/** The slice of the Supabase query builder used here (the offline store implements it too). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = { from: (t: string) => any };

const TABLE = "un_outside_requests";
export const MAX_ANSWER = 2000;

/** Build the requestOutside callback for one case: it queues the request (once per open question). */
export function queueingRequestOutside(db: Db, orgId: string, meta: { caseId: string; sopId: string; profile: string }) {
  return async (r: OutsideRequest): Promise<string> => {
    const { data: existing } = await db.from(TABLE).select("*").eq("org_id", orgId).eq("case_id", meta.caseId).eq("status", "open");
    const dup = ((existing ?? []) as OutsideRow[]).find((x) => x.question === r.question);
    if (dup) return `already queued for a person (${dup.id})`;
    const { data, error } = await db.from(TABLE).insert({
      org_id: orgId, case_id: meta.caseId, sop_id: meta.sopId, profile: meta.profile,
      question: r.question, reason: r.reason, tried: r.tried, status: "open",
    }).select("id").single();
    if (error || !data) throw new Error(`outside request not queued: ${error?.message ?? "unknown"}`);
    return `queued for a person (${(data as { id: string }).id})`;
  };
}

export async function listOutside(db: Db, orgId: string): Promise<OutsideRow[]> {
  const { data } = await db.from(TABLE).select("*").eq("org_id", orgId).order("created_at", { ascending: false });
  return (data ?? []) as OutsideRow[];
}

export type AnswerResult = { ok: true; hash: string } | { ok: false; error: string };

/** Answer one open request. Only the admin role may; the answer goes into the case memory first (so a
 * failed memory write leaves the request open), then the row is closed with the entry's hash. */
export async function answerOutside(
  db: Db, orgId: string, id: string,
  who: { role: string | null; userId?: string | null }, answer: string,
  store: MemoryStore, clock?: () => string,
): Promise<AnswerResult> {
  if (!isOrgAdmin(who.role)) return { ok: false, error: "Read-only access: only an admin may answer" };
  const text = answer.trim();
  if (!text) return { ok: false, error: "The answer is empty" };
  if (text.length > MAX_ANSWER) return { ok: false, error: `The answer is longer than ${MAX_ANSWER} characters` };
  const { data: row } = await db.from(TABLE).select("*").eq("org_id", orgId).eq("id", id).maybeSingle();
  const r = row as OutsideRow | null;
  if (!r) return { ok: false, error: "No such request" };
  if (r.status !== "open") return { ok: false, error: "Already answered" };
  const memory = new CaseMemory(r.case_id, store, clock);
  await memory.open();
  await memory.write("outside_answer", `person:${who.role}`, { question: r.question, answer: text, role: who.role, request_id: r.id, by: who.userId ?? null });
  const hash = memory.lastHash()!;
  const { error } = await db.from(TABLE).update({ status: "answered", answer: text, answered_role: who.role, answered_by: who.userId ?? null, answered_at: new Date().toISOString(), memory_hash: hash }).eq("org_id", orgId).eq("id", id);
  if (error) return { ok: false, error: `Answer remembered, but the queue row was not closed: ${error.message}` };
  return { ok: true, hash };
}
