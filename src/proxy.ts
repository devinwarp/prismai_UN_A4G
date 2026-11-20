import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|replay(?:/|$)|api/judge-login|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).+)",
  ],
};
