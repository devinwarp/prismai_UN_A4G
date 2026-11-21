import { createAdminClient } from "@/lib/supabase/admin";
import type { WatchEntry } from "./watchdog";

/** The production log, oldest first. Empty if the table is absent (supabase/un-agent-lifecycle.sql not applied). */
export async function loadWatch(orgId: string, useCaseId: string): Promise<WatchEntry[]> {
  const { data } = await createAdminClient().from("un_watchdog_log").select("*").eq("org_id", orgId).eq("use_case_id", useCaseId);
  return ((data ?? []) as Record<string, unknown>[])
    .map((r) => ({ seq: Number(r.seq), kind: r.kind, at: new Date(String(r.at)).toISOString(), actor: String(r.actor), payload: r.payload, prev_hash: String(r.prev_hash), hash: String(r.hash) }) as WatchEntry)
    .sort((a, b) => a.seq - b.seq);
}

export async function appendWatch(orgId: string, useCaseId: string, entries: WatchEntry[]): Promise<string | null> {
  if (!entries.length) return null;
  const { error } = await createAdminClient()
    .from("un_watchdog_log")
    .insert(entries.map((e) => ({ org_id: orgId, use_case_id: useCaseId, seq: e.seq, kind: e.kind, at: e.at, actor: e.actor, payload: e.payload, prev_hash: e.prev_hash, hash: e.hash })));
  return error?.message ?? null;
}

/** Demo reset: clears the production log for one use case. */
export async function resetWatch(orgId: string, useCaseId: string): Promise<string | null> {
  const { error } = await createAdminClient().from("un_watchdog_log").delete().eq("org_id", orgId).eq("use_case_id", useCaseId);
  return error?.message ?? null;
}
