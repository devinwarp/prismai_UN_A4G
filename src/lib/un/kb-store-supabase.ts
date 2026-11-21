import { assertContinues, type ChunkRow, type ConfigRow, type KbStore, type RunRow, type SopRow } from "./kb-store.ts";
import type { Question } from "./tuning-bank.ts";
import type { TuningEntry } from "./tuning-versions.ts";

// KbStore over Supabase, for supabase/un-sop-kb.sql. NOT applied to any database; unit-tested against a
// mocked client only (tests/un-kb-store.test.ts). Every query is scoped to one organisation.

type Res = { data: unknown; error: { message: string } | null };
interface Query extends PromiseLike<Res> {
  select(cols?: string): Query;
  eq(col: string, v: unknown): Query;
  order(col: string, o?: { ascending: boolean }): Query;
  limit(n: number): Query;
  upsert(rows: unknown, o?: { onConflict: string }): Query;
  insert(rows: unknown): Query;
  delete(): Query;
}
/** The slice of the supabase-js client this store uses. */
export interface SupabaseLike { from(table: string): Query }

const ok = async (q: PromiseLike<Res>): Promise<unknown> => { const r = await q; if (r.error) throw new Error(r.error.message); return r.data; };
const rows = (d: unknown) => (d ?? []) as Record<string, unknown>[];
/** pgvector travels as the text "[0.1,0.2,...]". */
const omit = (r: Record<string, unknown>, ...ks: string[]) => Object.fromEntries(Object.entries(r).filter(([k]) => !ks.includes(k)));
const vecOut = (v: number[] | null) => (v ? `[${v.join(",")}]` : null);
const vecIn = (v: unknown): number[] | null => (typeof v === "string" ? (JSON.parse(v) as number[]) : Array.isArray(v) ? (v as number[]) : null);

export function supabaseKbStore(db: SupabaseLike, orgId: string): KbStore {
  const t = (name: string) => db.from(name);
  const mine = (name: string) => t(name).select("*").eq("org_id", orgId);
  return {
    async putSop(s) { await ok(t("un_sops").upsert({ ...s, org_id: orgId, updated_at: new Date().toISOString() }, { onConflict: "org_id,sop_id" })); },
    async getSop(id) { const d = rows(await ok(mine("un_sops").eq("sop_id", id)))[0]; if (!d) return null; return omit(d, "org_id", "updated_at") as unknown as SopRow; },
    async putChunks(sopId, cs) {
      await ok(t("un_sop_chunks").delete().eq("org_id", orgId).eq("sop_id", sopId));
      if (cs.length) await ok(t("un_sop_chunks").insert(cs.map((c) => ({ ...c, org_id: orgId, embedding: vecOut(c.embedding) }))));
    },
    async listChunks(sopId) { return rows(await ok(mine("un_sop_chunks").eq("sop_id", sopId).order("chunk_id"))).map((r) => ({ chunk_id: r.chunk_id, sop_id: r.sop_id, text: r.text, sha256: r.sha256, topics: r.topics, meta: r.meta, embedding: vecIn(r.embedding) }) as ChunkRow); },
    async putConfig(c) { await ok(t("un_kb_configs").upsert({ ...c, org_id: orgId }, { onConflict: "org_id,id" })); },
    async listConfigs(target) { const q = mine("un_kb_configs"); return rows(await ok((target ? q.eq("target", target) : q).order("created_at"))).map((r) => omit(r, "org_id") as unknown as ConfigRow); },
    async putQuestions(sopId, qs) {
      await ok(t("un_kb_questions").delete().eq("org_id", orgId).eq("sop_id", sopId));
      if (qs.length) await ok(t("un_kb_questions").insert(qs.map((q) => ({ ...q, org_id: orgId, sop_id: sopId }))));
    },
    async listQuestions(sopId) { return rows(await ok(mine("un_kb_questions").eq("sop_id", sopId).order("id"))).map((r) => ({ id: r.id, question: r.question, expect: r.expect, split: r.split }) as Question); },
    async saveRun(r) { await ok(t("un_kb_runs").upsert({ ...r, org_id: orgId }, { onConflict: "org_id,id" })); },
    async listRuns(sopId, limit = 20) { return rows(await ok(mine("un_kb_runs").eq("sop_id", sopId).order("at", { ascending: false }).limit(limit))).map((r) => omit(r, "org_id") as unknown as RunRow); },
    async getLog() { return rows(await ok(mine("un_kb_log").order("seq"))).map((r) => ({ seq: Number(r.seq), kind: r.kind, at: new Date(String(r.at)).toISOString(), actor: r.actor, payload: r.payload, prev_hash: r.prev_hash, hash: r.hash }) as TuningEntry); },
    async appendLog(entries) {
      if (!entries.length) return;
      assertContinues(await this.getLog(), entries);
      // the primary key (org_id, seq) makes a concurrent writer fail instead of forking the chain
      await ok(t("un_kb_log").insert(entries.map((e) => ({ ...e, org_id: orgId }))));
    },
  };
}
