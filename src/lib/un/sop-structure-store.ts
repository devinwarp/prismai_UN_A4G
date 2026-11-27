import { createAdminClient } from "@/lib/supabase/admin";
import type { StructEntry } from "./sop-structure";

// The log of SOP structuring drafts and approvals of one use case (supabase/un-sop-structure.sql, not applied yet). Append-only.

const missing = (m: string) => (/un_sop_structure_log|schema cache/i.test(m) ? "The SOP structuring database migration is missing. Apply supabase/un-sop-structure.sql." : m);

export async function loadStructureLog(orgId: string, useCaseId: string): Promise<StructEntry[]> {
  const { data, error } = await createAdminClient().from("un_sop_structure_log").select("*").eq("org_id", orgId).eq("use_case_id", useCaseId);
  if (error) throw new Error(missing(error.message));
  return ((data ?? []) as Record<string, unknown>[])
    .map((r) => ({ seq: Number(r.seq), at: new Date(String(r.at)).toISOString(), actor: String(r.actor), kind: r.kind, payload: r.payload }) as StructEntry)
    .sort((a, b) => a.seq - b.seq);
}

/** Returns an error message, or null. A clash on (use case, seq) means someone else wrote first. */
export async function appendStructureLog(orgId: string, useCaseId: string, e: StructEntry): Promise<string | null> {
  const { error } = await createAdminClient().from("un_sop_structure_log").insert({ org_id: orgId, use_case_id: useCaseId, seq: e.seq, kind: e.kind, at: e.at, actor: e.actor, payload: e.payload });
  return error ? (/duplicate|unique/i.test(error.message) ? "Someone else changed this just now: reload and try again." : missing(error.message)) : null;
}
