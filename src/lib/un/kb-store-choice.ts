import { isOffline } from "../supabase/offline-flag.ts";

/** True when the Supabase tables of supabase/un-sop-kb.sql are the store: always against a real database
 * (a deployed server's disk is read-only and per-instance, so a file store there fails or shows nothing),
 * and a file store only offline, or with UN_KB_STORE=file. UN_KB_STORE=supabase forces the tables. */
export const kbUsesSupabase = () => process.env.UN_KB_STORE === "supabase" || (process.env.UN_KB_STORE !== "file" && !isOffline());
