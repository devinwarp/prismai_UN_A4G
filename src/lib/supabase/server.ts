import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isOffline } from "./offline-flag";
import { offlineClient } from "./offline";

export async function createClient() {
  if (isOffline()) return offlineClient() as unknown as ReturnType<typeof createServerClient>;
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — middleware refreshes sessions.
          }
        },
      },
    },
  );
}
