import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isOffline } from "./offline-flag";
import { OFFLINE_AS_COOKIE, offlineClient } from "./offline";

export async function createClient() {
  const cookieStore = await cookies();
  // offline, the picker's cookie chooses which person of the local store is signed in (never read when online)
  if (isOffline()) return offlineClient(cookieStore.get(OFFLINE_AS_COOKIE)?.value) as unknown as ReturnType<typeof createServerClient>;

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
