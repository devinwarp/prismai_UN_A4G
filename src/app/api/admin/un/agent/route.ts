import { NextResponse } from "next/server";
import { bad, forbidden, requirePermission } from "@/lib/api-auth";
import { loadAgentSettings, saveAgentSettings } from "@/lib/un/inbox-store";
import { loadPeople } from "@/lib/un/roles-store";

/** GET ?user=<id> → a person's agent settings (their own by default). */
export async function GET(request: Request) {
  const who = await requirePermission("view");
  if (who instanceof NextResponse) return who;
  const user = new URL(request.url).searchParams.get("user") ?? who.id;
  if (user !== who.id && !who.decide("users.manage").ok) return forbidden("You can read only your own agent's settings");
  return NextResponse.json({ settings: await loadAgentSettings(who.org_id!, user) });
}

/**
 * POST { enabled?, daily_cap?, user? } → the kill switch and the daily cap of a person's agent. A person sets their own; an administrator (users.manage) may
 * set anyone's. An agent never takes a sign-off, whatever these say: they only switch its Responsible work and bound it.
 */
export async function POST(request: Request) {
  const who = await requirePermission("view");
  if (who instanceof NextResponse) return who;
  const b = (await request.json().catch(() => ({}))) as { enabled?: unknown; daily_cap?: unknown; user?: unknown };
  const user = typeof b.user === "string" && b.user ? b.user : who.id;
  if (user !== who.id && !who.decide("users.manage").ok) return forbidden("You can change only your own agent");
  if (user !== who.id && !(await loadPeople(who.org_id!)).some((p) => p.id === user)) return bad("That person is not in this organisation");
  const patch: { enabled?: boolean; daily_cap?: number } = {};
  if (typeof b.enabled === "boolean") patch.enabled = b.enabled;
  if (b.daily_cap !== undefined) {
    const n = Number(b.daily_cap);
    if (!Number.isInteger(n) || n < 0 || n > 1000) return bad("The daily limit is a whole number from 0 to 1000");
    patch.daily_cap = n;
  }
  if (!Object.keys(patch).length) return bad("Nothing to change");
  const error = await saveAgentSettings(who.org_id!, user, patch, who.id);
  return error ? NextResponse.json({ error }, { status: 500 }) : NextResponse.json({ ok: true, settings: await loadAgentSettings(who.org_id!, user) });
}
