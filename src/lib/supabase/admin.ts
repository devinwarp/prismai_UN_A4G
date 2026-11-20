import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { isOffline } from "./offline-flag";
import { offlineClient } from "./offline";

// Service-role client — server code only, bypasses RLS. Always verify the
// caller's identity/role before using this.
export function createAdminClient() {
  if (isOffline()) return offlineClient() as unknown as ReturnType<typeof createSupabaseClient>;
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
