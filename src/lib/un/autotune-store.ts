import { createAdminClient } from "@/lib/supabase/admin";
import type { AutoEntry } from "./auto-tune";

/** A readable message for a store error: a missing table says which file to apply. */
export function describeAutoStoreError(message: string): string {
  return /un_autotune_log/.test(message) && /does not exist|schema cache|not find/i.test(message)
    ? "The auto-tuning table (un_autotune_log) does not exist. Apply supabase/un-autotune.sql to the database."
    : message;
}

/** The auto-tuning log of one use case (the switch, the limit and the cycles), oldest first. Throws a readable error when the table cannot
 * be read, so an unread log is never mistaken for "off with no history". */
export async function loadAutoLog(orgId: string, useCaseId: string): Promise<AutoEntry[]> {
  const { data, error } = await createAdminClient().from("un_autotune_log").select("*").eq("org_id", orgId).eq("use_case_id", useCaseId);
  if (error) throw new Error(describeAutoStoreError(error.message));
  return ((data ?? []) as Record<string, unknown>[])
    .map((r) => ({ seq: Number(r.seq), kind: r.kind, at: new Date(String(r.at)).toISOString(), actor: String(r.actor), payload: r.payload, prev_hash: String(r.prev_hash), hash: String(r.hash) }) as AutoEntry)
    .sort((a, b) => a.seq - b.seq);
}

/** Returns an error message, or null. A clash on (use case, seq) means someone else wrote first. */
export async function appendAutoLog(orgId: string, useCaseId: string, e: AutoEntry): Promise<string | null> {
  const { error } = await createAdminClient()
    .from("un_autotune_log")
    .insert({ org_id: orgId, use_case_id: useCaseId, seq: e.seq, kind: e.kind, at: e.at, actor: e.actor, payload: e.payload, prev_hash: e.prev_hash, hash: e.hash });
  return error ? describeAutoStoreError(error.message) : null;
}
