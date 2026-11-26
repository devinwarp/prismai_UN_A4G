import { NextResponse } from "next/server";
import { isOffline } from "@/lib/supabase/offline-flag";
import { OFFLINE_AS_COOKIE, OFFLINE_ORG, offlineClient } from "@/lib/supabase/offline";

// The offline "sign in as" picker: lets one person try the app as each role. It exists only in offline mode (a local file store); online it does
// not exist (404), so it can never become a way to act as someone else on a real deployment.

const off = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/** GET → the people of the local store with their stored role, job title and the roles assigned to them. */
export async function GET() {
  if (!isOffline()) return off();
  const db = offlineClient();
  const [{ data: profiles }, { data: roles }] = await Promise.all([
    db.from("profiles").select("*").eq("org_id", OFFLINE_ORG) as unknown as Promise<{ data: Record<string, unknown>[] }>,
    db.from("un_role_assignments").select("*").eq("org_id", OFFLINE_ORG) as unknown as Promise<{ data: Record<string, unknown>[] }>,
  ]);
  const live = (roles ?? []).filter((r) => !r.revoked_at);
  const people = (profiles ?? []).map((p) => ({
    id: String(p.id),
    email: (p.email as string | null) ?? null,
    name: (p.full_name as string | null) ?? null,
    job_title: (p.job_title as string | null) ?? null,
    legacy_role: (p.role as string | null) ?? null,
    roles: live.filter((r) => r.user_id === p.id).map((r) => `${r.role}${r.scope_entity ? `: ${r.scope_entity}` : r.scope_country ? `: ${r.scope_country}` : r.use_case_id ? " (use case)" : ""}`),
  })).sort((a, b) => (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""));
  return NextResponse.json({ people });
}

/** POST { id } → signs in as that person from now on (a cookie). POST { id: null } → back to the default offline admin. */
export async function POST(request: Request) {
  if (!isOffline()) return off();
  const b = (await request.json().catch(() => ({}))) as { id?: unknown };
  const res = NextResponse.json({ ok: true });
  if (typeof b.id === "string" && b.id) res.cookies.set(OFFLINE_AS_COOKIE, b.id, { path: "/", httpOnly: true, sameSite: "lax" });
  else res.cookies.delete(OFFLINE_AS_COOKIE);
  return res;
}
