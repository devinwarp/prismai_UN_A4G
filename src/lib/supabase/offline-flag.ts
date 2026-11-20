// Offline mode: OFFLINE=1, or the Supabase env absent outside production
// (a misconfigured production deploy must fail closed, never become open admin).
// Kept free of node imports so the proxy can use it.
export function isOffline(): boolean {
  if (process.env.OFFLINE === "1") return true;
  return process.env.NODE_ENV !== "production" && !(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
