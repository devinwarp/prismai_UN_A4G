import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { newItem, type InboxItem, type NewItem, isOpen } from "./inbox";
import type { Letter } from "./raci";

// Storage for the inbox, the RACI overrides, each user's agent settings and the agents' action log (supabase/un-agent-inbox.sql, NOT applied yet: until it is,
// every read here returns nothing and a write returns an error message, never a thrown error, so the pages still load).

type Row = Record<string, unknown>;
const db = () => createAdminClient();

const asItem = (r: Row): InboxItem => ({
  id: String(r.id), org_id: String(r.org_id), created_at: String(r.created_at), kind: String(r.kind), mode: r.mode as InboxItem["mode"], letter: r.letter as Letter,
  handler: r.handler as InboxItem["handler"], status: r.status as InboxItem["status"], user_id: String(r.user_id), subject: String(r.subject ?? ""), body: String(r.body ?? ""),
  entity: (r.entity as string | null) ?? null, country: (r.country as string | null) ?? null, use_case_id: (r.use_case_id as string | null) ?? null, link: (r.link as string | null) ?? null,
  payload: (r.payload as Record<string, unknown>) ?? {}, dedupe_key: String(r.dedupe_key), attempts: Number(r.attempts ?? 0), blocked_reason: (r.blocked_reason as string | null) ?? null,
  escalate_at: (r.escalate_at as string | null) ?? null, escalated_at: (r.escalated_at as string | null) ?? null, escalated_from: (r.escalated_from as string | null) ?? null,
  read_at: (r.read_at as string | null) ?? null, resolved_at: (r.resolved_at as string | null) ?? null, resolved_by: (r.resolved_by as string | null) ?? null, created_by: String(r.created_by ?? "system"),
});

/** Adds items, skipping any whose (user, dedupe key) already has an open item. Returns the items added and an error message, if any. */
export async function addItems(orgId: string, items: NewItem[], now = new Date()): Promise<{ added: InboxItem[]; error: string | null }> {
  if (!items.length) return { added: [], error: null };
  const { data: open, error: readError } = await db().from("un_inbox_items").select("*").eq("org_id", orgId);
  if (readError) return { added: [], error: readError.message };
  const have = new Set(((open ?? []) as Row[]).map(asItem).filter(isOpen).map((i) => `${i.user_id}|${i.dedupe_key}`));
  const fresh = items.filter((n) => { const k = `${n.user_id}|${n.dedupe_key}`; if (have.has(k)) return false; have.add(k); return true; });
  const rows = fresh.map((n) => newItem(n, { org_id: orgId, id: randomUUID(), now }));
  if (!rows.length) return { added: [], error: null };
  const { error } = await db().from("un_inbox_items").insert(rows);
  return { added: error ? [] : rows, error: error?.message ?? null };
}

export async function loadItemsOf(orgId: string, userId: string): Promise<InboxItem[]> {
  const { data } = await db().from("un_inbox_items").select("*").eq("org_id", orgId).eq("user_id", userId);
  return ((data ?? []) as Row[]).map(asItem).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function loadOpenItems(orgId: string): Promise<InboxItem[]> {
  const { data } = await db().from("un_inbox_items").select("*").eq("org_id", orgId);
  return ((data ?? []) as Row[]).map(asItem).filter(isOpen);
}

export async function loadItem(orgId: string, id: string): Promise<InboxItem | null> {
  const { data } = await db().from("un_inbox_items").select("*").eq("org_id", orgId).eq("id", id).maybeSingle();
  return data ? asItem(data as Row) : null;
}

export async function updateItem(orgId: string, id: string, patch: Partial<InboxItem>): Promise<string | null> {
  const { error } = await db().from("un_inbox_items").update(patch).eq("org_id", orgId).eq("id", id);
  return error?.message ?? null;
}

// ---- each user's agent --------------------------------------------------------------------------------------------------------------------------

export interface AgentSettings { enabled: boolean; daily_cap: number }
export const DEFAULT_AGENT: AgentSettings = { enabled: true, daily_cap: 50 };

export async function loadAgentSettings(orgId: string, userId: string): Promise<AgentSettings> {
  const { data } = await db().from("un_agent_settings").select("*").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
  const r = data as Row | null;
  return r ? { enabled: r.enabled !== false, daily_cap: Number(r.daily_cap ?? DEFAULT_AGENT.daily_cap) } : DEFAULT_AGENT;
}

export async function saveAgentSettings(orgId: string, userId: string, s: Partial<AgentSettings>, by: string): Promise<string | null> {
  const cur = await loadAgentSettings(orgId, userId);
  const { error } = await db().from("un_agent_settings").upsert({ org_id: orgId, user_id: userId, ...cur, ...s, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: "org_id,user_id" });
  return error?.message ?? null;
}

// ---- the agents' action log: append-only, hash-chained per user -----------------------------------------------------------------------------------

export interface AgentLogEntry { seq: number; at: string; item_id: string | null; action: string; outcome: "done" | "blocked" | "skipped"; detail: Record<string, unknown>; prev_hash: string | null; hash: string }

export const chainHash = (prev: string | null, e: Omit<AgentLogEntry, "hash" | "prev_hash">): string =>
  createHash("sha256").update(`${prev ?? ""}|${e.seq}|${e.at}|${e.item_id ?? ""}|${e.action}|${e.outcome}|${JSON.stringify(e.detail)}`).digest("hex");

export async function loadAgentLog(orgId: string, userId: string): Promise<AgentLogEntry[]> {
  const { data } = await db().from("un_agent_log").select("*").eq("org_id", orgId).eq("user_id", userId).order("seq", { ascending: true });
  return ((data ?? []) as Row[]).map((r) => ({ seq: Number(r.seq), at: String(r.at ?? r.created_at), item_id: (r.item_id as string | null) ?? null, action: String(r.action), outcome: r.outcome as AgentLogEntry["outcome"], detail: (r.detail as Record<string, unknown>) ?? {}, prev_hash: (r.prev_hash as string | null) ?? null, hash: String(r.hash) }));
}

export async function appendAgentLog(orgId: string, userId: string, e: { item_id: string | null; action: string; outcome: AgentLogEntry["outcome"]; detail?: Record<string, unknown> }, now = new Date()): Promise<string | null> {
  const log = await loadAgentLog(orgId, userId);
  const last = log[log.length - 1];
  const entry = { seq: (last?.seq ?? 0) + 1, at: now.toISOString(), item_id: e.item_id, action: e.action, outcome: e.outcome, detail: e.detail ?? {} };
  const { error } = await db().from("un_agent_log").insert({ org_id: orgId, user_id: userId, ...entry, prev_hash: last?.hash ?? null, hash: chainHash(last?.hash ?? null, entry) });
  return error?.message ?? null;
}

export function verifyAgentLog(log: AgentLogEntry[]): { ok: true } | { ok: false; broken_seq: number } {
  let prev: string | null = null;
  for (const e of log) {
    if (e.prev_hash !== prev || e.hash !== chainHash(prev, e)) return { ok: false, broken_seq: e.seq };
    prev = e.hash;
  }
  return { ok: true };
}

// ---- RACI overrides ---------------------------------------------------------------------------------------------------------------------------

export async function loadRaciOverrides(orgId: string): Promise<{ user_id: string; step: string; letter: Letter; entity: string | null; use_case_id: string | null }[]> {
  const { data } = await db().from("un_raci_overrides").select("*").eq("org_id", orgId);
  return ((data ?? []) as Row[]).filter((r) => !r.revoked_at).map((r) => ({ user_id: String(r.user_id), step: String(r.step), letter: r.letter as Letter, entity: (r.entity as string | null) ?? null, use_case_id: (r.use_case_id as string | null) ?? null }));
}
