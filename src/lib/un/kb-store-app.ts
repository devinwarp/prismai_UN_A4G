import path from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { kbUsesSupabase } from "./kb-store-choice";
import { fileKbStore, type KbStore } from "./kb-store";
import { supabaseKbStore, type SupabaseLike } from "./kb-store-supabase";

/** The store the app uses. The file lives beside the offline database, so a separate OFFLINE_DB gives a
 * separate store. */
export function appKbStore(orgId: string): KbStore {
  if (kbUsesSupabase()) return supabaseKbStore(createAdminClient() as unknown as SupabaseLike, orgId);
  const db = process.env.OFFLINE_DB ?? ".data/offline-db.json";
  // resolve, not join: OFFLINE_DB may be an absolute path, and join would glue it onto the working directory
  return fileKbStore(path.resolve(process.cwd(), db.replace(/\.json$/, "") + ".kb.json"));
}
