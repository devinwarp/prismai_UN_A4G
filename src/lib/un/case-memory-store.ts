import { createAdminClient } from "@/lib/supabase/admin";
import type { MemoryEntry, MemoryStore } from "./case-memory";

/** Case memory in Supabase (supabase/un-agent-runtime.sql, not yet applied). Tests use inMemoryStore. */
export function adminMemoryStore(orgId: string): MemoryStore {
  return {
    async load(caseId) {
      const { data } = await createAdminClient().from("un_case_memory").select("*").eq("org_id", orgId).eq("case_id", caseId);
      return ((data ?? []) as Record<string, unknown>[])
        .map((r) => ({ seq: Number(r.seq), kind: r.kind, at: new Date(String(r.at)).toISOString(), actor: String(r.actor), payload: r.payload, prev_hash: String(r.prev_hash), hash: String(r.hash) }) as MemoryEntry)
        .sort((a, b) => a.seq - b.seq);
    },
    async append(caseId, entries) {
      if (!entries.length) return;
      const { error } = await createAdminClient()
        .from("un_case_memory")
        .insert(entries.map((e) => ({ org_id: orgId, case_id: caseId, seq: e.seq, kind: e.kind, at: e.at, actor: e.actor, payload: e.payload, prev_hash: e.prev_hash, hash: e.hash })));
      if (error) throw new Error(`case memory not saved: ${error.message}`);
    },
  };
}
