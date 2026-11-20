import { isOffline } from "../supabase/offline-flag.ts";

/** Credentials for the read-only judge account. Server env only; never sent to the client. */
export function judgeCredentials(): { email: string; password: string } | null {
  const email = process.env.JUDGE_LOGIN_EMAIL?.trim();
  const password = process.env.JUDGE_LOGIN_PASSWORD;
  return email && password ? { email, password } : null;
}

/** The one-click judge button shows only when it can work. */
export function judgeLoginAvailable(): boolean {
  return isOffline() || judgeCredentials() !== null;
}

// ponytail: in-memory per-instance limiter; on serverless each instance has its own
// window, so this blunts bursts, not a distributed attack. Move to a shared store if needed.
const hits = new Map<string, number[]>();
export function allowJudgeAttempt(key: string, now = Date.now(), limit = 8, windowMs = 60_000): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return true;
}
