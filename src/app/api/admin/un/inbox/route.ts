import { NextResponse } from "next/server";
import { bad, forbidden, notFound, requirePermission } from "@/lib/api-auth";
import { isHumanDecision } from "@/lib/un/raci";
import { refresh, runAgent, sweepPeople } from "@/lib/un/inbox-service";
import { countsOf as counts, isOpen } from "@/lib/un/inbox";
import { loadAgentLog, loadAgentSettings, loadItem, loadItemsOf, updateItem, verifyAgentLog } from "@/lib/un/inbox-store";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * GET → the signed-in person's inbox, their agent's settings and its recent log. Opening it makes the People agent sweep, escalates what has waited too long,
 * and lets the person's agent work its items (event-driven: nothing polls). GET ?summary=1 → only the counts, for the bell, with no work done.
 */
export async function GET(request: Request) {
  const who = await requirePermission("view");
  if (who instanceof NextResponse) return who;
  const orgId = who.org_id!;
  const url = new URL(request.url);
  if (url.searchParams.get("summary") === "1") return NextResponse.json({ counts: counts(await loadItemsOf(orgId, who.id)) });
  const ran = await refresh(orgId, { id: who.id, legacy_role: who.role }).catch((e: Error) => ({ error: e.message }));
  const [items, settings, log] = await Promise.all([loadItemsOf(orgId, who.id), loadAgentSettings(orgId, who.id), loadAgentLog(orgId, who.id)]);
  return NextResponse.json({ items, counts: counts(items), settings, log: log.slice(-30).reverse(), log_ok: verifyAgentLog(log).ok, ran });
}

/**
 * POST { action, id?, ... } on the signed-in person's own items.
 *   read      { id }             mark an item read
 *   done      { id }             a person has dealt with an action item (never an approval: that closes when the decision is made)
 *   dismiss   { id }             put information away
 *   send      { id, reply }      send the reply to a consult (the agent's draft, edited), which closes it
 *   run_agent                    let my agent work my items now
 *   sweep                        the People agent looks for unfilled positions now
 */
export async function POST(request: Request) {
  const who = await requirePermission("view");
  if (who instanceof NextResponse) return who;
  const orgId = who.org_id!;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const act = text(b.action, 20);
  if (act === "run_agent") return NextResponse.json({ ok: true, agent: await runAgent(orgId, { id: who.id, legacy_role: who.role }) });
  if (act === "sweep") return NextResponse.json({ ok: true, ...(await sweepPeople(orgId)) });
  if (!["read", "done", "dismiss", "send"].includes(act)) return bad("Unknown action");
  const item = await loadItem(orgId, text(b.id, 80));
  if (!item) return notFound();
  if (item.user_id !== who.id) return forbidden("That item is not in your inbox");
  const now = new Date().toISOString();
  if (act === "read") return respond(await updateItem(orgId, item.id, { read_at: item.read_at ?? now }));
  if (!isOpen(item)) return bad("That item is already closed");
  if (act === "dismiss") {
    if (item.mode !== "inform") return bad("Only information can be put away; an action or a decision closes when it is dealt with");
    return respond(await updateItem(orgId, item.id, { status: "dismissed", read_at: item.read_at ?? now, resolved_at: now, resolved_by: who.id }));
  }
  if (act === "done") {
    if (item.mode === "approval" || isHumanDecision(item.kind)) return bad("A decision is closed by making it, on its own page: open it from the link");
    if (item.mode !== "action") return bad("Only an action can be marked done");
    return respond(await updateItem(orgId, item.id, { status: "done", resolved_at: now, resolved_by: who.id }));
  }
  // send: a consult's reply, which is the person's, not the agent's
  if (item.mode !== "consult") return bad("Only a consult takes a reply");
  const reply = text(b.reply, 4000);
  if (!reply) return bad("Write the reply first");
  return respond(await updateItem(orgId, item.id, { status: "done", resolved_at: now, resolved_by: who.id, payload: { ...item.payload, response: reply, responded_at: now } }));
}

const respond = (error: string | null) => (error ? NextResponse.json({ error }, { status: 500 }) : NextResponse.json({ ok: true }));
