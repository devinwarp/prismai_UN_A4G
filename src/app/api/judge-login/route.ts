import { NextResponse } from "next/server";
import { allowJudgeAttempt, judgeCredentials } from "@/lib/un/judge-login";
import { isOffline } from "@/lib/supabase/offline-flag";
import { createClient } from "@/lib/supabase/server";

// One-click read-only judge sign-in. Credentials come from server env only.
// The account is a viewer (JUDGE_EMAILS), so every write route refuses it.
// A plain GET so a QR code or link can land here; the page links to it with <a>, not <Link>, to avoid prefetch.
export const dynamic = "force-dynamic";

function go(request: Request, path: string) {
  const res = NextResponse.redirect(new URL(path, new URL(request.url).origin), 303);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function GET(request: Request) {
  // Offline demo: the existing auto-login already applies (OFFLINE_ROLE=viewer previews read-only).
  if (isOffline()) return go(request, "/admin/federal");

  const creds = judgeCredentials();
  if (!creds) return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allowJudgeAttempt(ip)) {
    return new NextResponse("Too many attempts. Wait a minute and try again.", {
      status: 429,
      headers: { "Retry-After": "60", "Cache-Control": "no-store" },
    });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(creds);
  if (error) return go(request, "/login?error=judge");
  return go(request, "/auth/continue");
}
