import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client — server code only, bypasses RLS. Always verify the
// caller's identity/role before using this.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
