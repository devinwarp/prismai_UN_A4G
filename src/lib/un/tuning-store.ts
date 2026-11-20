import { createAdminClient } from "@/lib/supabase/admin";
import type { LogEntry } from "./tuning";

/** The use case's iteration log, oldest first. Empty if the table is absent (supabase/un-agent-lifecycle.sql not applied). */
export async function loadLog(orgId: string, useCaseId: string): Promise<LogEntry[]> {
  const { data } = await createAdminClient().from("un_tuning_log").select("*").eq("org_id", orgId).eq("use_case_id", useCaseId);
  return ((data ?? []) as Record<string, unknown>[])
    .map((r) => ({ seq: Number(r.seq), kind: r.kind, at: new Date(String(r.at)).toISOString(), actor: String(r.actor), payload: r.payload, prev_hash: String(r.prev_hash), hash: String(r.hash) }) as LogEntry)
    .sort((a, b) => a.seq - b.seq);
}

export async function appendLog(orgId: string, useCaseId: string, entries: LogEntry[]): Promise<string | null> {
  if (!entries.length) return null;
  const { error } = await createAdminClient()
    .from("un_tuning_log")
    .insert(entries.map((e) => ({ org_id: orgId, use_case_id: useCaseId, seq: e.seq, kind: e.kind, at: e.at, actor: e.actor, payload: e.payload, prev_hash: e.prev_hash, hash: e.hash })));
  return error?.message ?? null;
}

/** Demo reset: clears the log and the stored eval runs for one use case. */
export async function resetTuning(orgId: string, useCaseId: string): Promise<string | null> {
  const admin = createAdminClient();
  const a = await admin.from("un_tuning_log").delete().eq("org_id", orgId).eq("use_case_id", useCaseId);
  if (a.error) return a.error.message;
  const b = await admin.from("un_eval_runs").delete().eq("org_id", orgId).eq("use_case_id", useCaseId);
  return b.error?.message ?? null;
}
