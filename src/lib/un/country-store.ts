import type { SupabaseLike } from "./kb-store-supabase.ts";
import type { CountryEntry } from "./country.ts";
import { GENESIS } from "./tuning.ts";

// Storage for the country log and the blobs a live build produces (vectors, a company's SOP chunks).
// One implementation over the supabase-js query shape, used for BOTH paths: in the app it gets createAdminClient(),
// which is the real client when hosted and the file-backed stand-in (supabase/offline.ts) when OFFLINE=1.
// Tables: supabase/un-country.sql (NOT applied to any database yet). Query shapes are kept to select/eq/insert/upsert/delete.
// Rows are sorted here, not by the database: the log is small, and a numeric sort is not something to trust to a text sort.

export interface CountryStore {
  log(): Promise<CountryEntry[]>;
  /** Append-only: the first entry must continue the stored head. */
  append(entries: CountryEntry[]): Promise<void>;
  putBlob(key: string, body: unknown): Promise<void>;
  getBlob(key: string): Promise<unknown | null>;
  delBlob(key: string): Promise<void>;
}

type Res = { data: unknown; error: { message: string } | null };
const ok = async (q: PromiseLike<Res>): Promise<unknown> => { const r = await q; if (r.error) throw new Error(r.error.message); return r.data; };
const rows = (d: unknown) => (d ?? []) as Record<string, unknown>[];

export function countryStore(db: SupabaseLike, orgId: string): CountryStore {
  const log = async (): Promise<CountryEntry[]> =>
    rows(await ok(db.from("un_country_log").select("*").eq("org_id", orgId)))
      .map((r) => ({ seq: Number(r.seq), kind: r.kind, at: new Date(String(r.at)).toISOString(), actor: String(r.actor), payload: r.payload, prev_hash: String(r.prev_hash), hash: String(r.hash) }) as CountryEntry)
      .sort((a, b) => a.seq - b.seq);
  return {
    log,
    async append(entries) {
      if (!entries.length) return;
      const stored = await log();
      const last = stored[stored.length - 1];
      if (entries[0].seq !== (last?.seq ?? 0) + 1 || entries[0].prev_hash !== (last?.hash ?? GENESIS)) throw new Error("the country log is append-only: these entries do not continue the stored log (someone else wrote first; reload)");
      await ok(db.from("un_country_log").insert(entries.map((e) => ({ org_id: orgId, seq: e.seq, kind: e.kind, at: e.at, actor: e.actor, payload: e.payload, prev_hash: e.prev_hash, hash: e.hash }))));
    },
    async putBlob(key, body) { await ok(db.from("un_country_blobs").upsert({ org_id: orgId, key, body, updated_at: new Date().toISOString() }, { onConflict: "org_id,key" })); },
    async getBlob(key) { const r = rows(await ok(db.from("un_country_blobs").select("*").eq("org_id", orgId).eq("key", key)))[0]; return r ? r.body : null; },
    async delBlob(key) { await ok(db.from("un_country_blobs").delete().eq("org_id", orgId).eq("key", key)); },
  };
}
