import { NextResponse } from "next/server";
import { ensureProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Post-login funnel for password sign-in: ensure profile,
// send admins to the federal dashboard.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  await ensureProfile(user);

  const dest =
    "/admin/federal";
  return NextResponse.redirect(new URL(dest, url.origin));
}
