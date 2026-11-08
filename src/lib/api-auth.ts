import { NextResponse } from "next/server";
import { createClient } from "./supabase/server";

// Session + role helpers shared by the /api/admin/un routes.
export interface Caller {
  id: string;
  email: string | null;
  role: string | null;
  org_id: string | null;
}

/** The signed-in caller with role + org, or null. */
export async function caller(): Promise<Caller | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, org_id")
    .eq("id", user.id)
    .maybeSingle();
  return {
    id: user.id,
    email: user.email ?? null,
    role: profile?.role ?? null,
    org_id: profile?.org_id ?? null,
  };
}

/** Admin of an org, or the error response to return. Viewers can't write
 * (they may only decide their own sign-offs — see signoffs/[sid]). */
export async function requireAdmin(): Promise<Caller | NextResponse> {
  const who = await caller();
  if (!who) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (who.role !== "admin" || !who.org_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return who;
}

export const notFound = () =>
  NextResponse.json({ error: "Use case not found" }, { status: 404 });
export const bad = (error: string) => NextResponse.json({ error }, { status: 400 });
