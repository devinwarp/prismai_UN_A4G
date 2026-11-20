// Offline mode: OFFLINE=1, or the Supabase env absent outside production
// (a misconfigured production deploy must fail closed, never become open admin).
// OFFLINE=1 alone is also ignored in production: the open, auto-signed-in admin there needs a
// second, deliberate opt-in (OFFLINE_ALLOW_PRODUCTION=1), so a stray variable cannot open a live deploy.
// Kept free of node imports so the proxy can use it.
export function isOffline(): boolean {
  if (process.env.OFFLINE === "1") {
    return process.env.NODE_ENV !== "production" || process.env.OFFLINE_ALLOW_PRODUCTION === "1";
  }
  return process.env.NODE_ENV !== "production" && !(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
