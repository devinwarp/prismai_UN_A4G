import path from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { fileKbStore, type KbStore } from "./kb-store";
import { supabaseKbStore, type SupabaseLike } from "./kb-store-supabase";

/** The store the app uses. File store by default (also offline); set UN_KB_STORE=supabase to use the
 * Supabase tables of supabase/un-sop-kb.sql (not applied anywhere yet). The file lives beside the offline
 * database, so a separate OFFLINE_DB gives a separate store. */
export function appKbStore(orgId: string): KbStore {
  if (process.env.UN_KB_STORE === "supabase") return supabaseKbStore(createAdminClient() as unknown as SupabaseLike, orgId);
  const db = process.env.OFFLINE_DB ?? ".data/offline-db.json";
  // resolve, not join: OFFLINE_DB may be an absolute path, and join would glue it onto the working directory
  return fileKbStore(path.resolve(process.cwd(), db.replace(/\.json$/, "") + ".kb.json"));
}
