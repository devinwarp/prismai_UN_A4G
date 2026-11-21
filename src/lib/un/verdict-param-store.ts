import { createAdminClient } from "@/lib/supabase/admin";
import type { ParamEntry } from "./verdict-params";

/** The verdict-parameter log of one use case and job profile, oldest first. Empty if the table is absent
 * (supabase/un-verdict-params.sql not applied). */
export async function loadParamLog(orgId: string, useCaseId: string, profile: string): Promise<ParamEntry[]> {
  const { data } = await createAdminClient().from("un_verdict_param_log").select("*").eq("org_id", orgId).eq("use_case_id", useCaseId).eq("profile", profile);
  return ((data ?? []) as Record<string, unknown>[])
    .map((r) => ({ seq: Number(r.seq), kind: r.kind, at: new Date(String(r.at)).toISOString(), actor: String(r.actor), payload: r.payload, prev_hash: String(r.prev_hash), hash: String(r.hash) }) as ParamEntry)
    .sort((a, b) => a.seq - b.seq);
}

/** Returns an error message, or null. A clash on (use case, profile, seq) means someone else wrote first. */
export async function appendParamLog(orgId: string, useCaseId: string, profile: string, entry: ParamEntry): Promise<string | null> {
  const { error } = await createAdminClient()
    .from("un_verdict_param_log")
    .insert({ org_id: orgId, use_case_id: useCaseId, profile, seq: entry.seq, kind: entry.kind, at: entry.at, actor: entry.actor, payload: entry.payload, prev_hash: entry.prev_hash, hash: entry.hash });
  return error?.message ?? null;
}
