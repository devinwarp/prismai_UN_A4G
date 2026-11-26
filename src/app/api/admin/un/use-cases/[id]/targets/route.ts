import { NextResponse } from "next/server";
import { noticeApproval } from "@/lib/un/inbox-service";
import { bad, forbidden, notFound, requirePermission } from "@/lib/api-auth";
import { resolveApprover } from "@/lib/un/approvers";
import { withGovernance } from "@/lib/un/approvers";
import { approversForUseCase } from "@/lib/un/approvers-store";
import { isUuid } from "@/lib/un/model";
import { loadUseCase } from "@/lib/un/sijil-store";
import { appendTargetLog, loadGoalsResolved, loadTargetLog } from "@/lib/un/target-store";
import { appendTargets, coverage, describeTargetStoreError, planTargets, replayTargets, verifyTargets, type TargetAction } from "@/lib/un/targets";

type Ctx = { params: Promise<{ id: string }> };
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const unreadable = (e: unknown) => NextResponse.json({ error: e instanceof Error ? e.message : "The target log could not be read" }, { status: 503 });

/** GET → the targets of this use case: the entity's goals (read-only), the proposal waiting, the approval in force, the
 * goals each approved target contributes to, and the chain status. Any signed-in role. */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const who = await requirePermission("view");
  if (who instanceof NextResponse) return who;
  const uc = await loadUseCase(who.org_id!, id);
  if (!uc) return notFound();
  let log;
  try { log = await loadTargetLog(who.org_id!, id); } catch (e) { return unreadable(e); }
  const { goals, source } = await loadGoalsResolved(who.org_id!, uc.entity);
  const state = replayTargets(log);
  return NextResponse.json({ entity: uc.entity, goals, goals_source: source, state, coverage: coverage(goals, state.approved?.targets ?? []), chain: verifyTargets(log), entries: log.length });
}

/** POST { action, ... } → one change to the targets of a use case.
 *   propose  { targets, note? }     the whole list of targets, each linked to a goal of the entity
 *   approve  { approver?, self_approval_reason? }   lock the proposal at its hash
 *   withdraw { reason }
 * Proposing needs scenario.edit; approving or withdrawing needs scenario.approve, like the verdict parameters. The
 * approver is chosen from the use case's list, never typed. Every change is one entry of a hash-chained log. */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const who = await requirePermission(["scenario.edit", "scenario.approve"], { useCaseId: id });
  if (who instanceof NextResponse) return who;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const act = b.action;
  const may = act === "approve" || act === "withdraw" ? who.decide("scenario.approve") : who.decide("scenario.edit");
  if (!may.ok) return forbidden(may.reason);
  if (!["propose", "approve", "withdraw"].includes(String(act))) return bad("Unknown action");
  const uc = await loadUseCase(who.org_id!, id);
  if (!uc) return notFound();

  let log;
  try { log = await loadTargetLog(who.org_id!, id); } catch (e) { return unreadable(e); }
  const v = verifyTargets(log);
  if (!v.ok) return NextResponse.json({ error: `The target log failed verification at entry ${v.broken_seq}: ${v.reason}` }, { status: 409 });
  const state = replayTargets(log);
  const { goals } = await loadGoalsResolved(who.org_id!, uc.entity);

  let action: TargetAction;
  if (act === "propose") action = { type: "propose", targets: b.targets, note: text(b.note, 500) || undefined };
  else if (act === "approve") {
    const a = resolveApprover(b.approver, withGovernance(await approversForUseCase(who.org_id!, id)));
    if (!a.ok) return bad(a.error);
    action = { type: "approve", approver: a.approver, self_approval_reason: text(b.self_approval_reason, 500) || undefined };
  } else action = { type: "withdraw", reason: text(b.reason, 500) };

  const p = planTargets(state, action, who.id, goals);
  if (!p.ok) return bad(p.error);
  const entry = appendTargets(log[log.length - 1] ?? null, p.kind, who.email ?? who.id, p.payload, new Date().toISOString());
  const err = await appendTargetLog(who.org_id!, id, entry);
  if (err) {
    const clash = /duplicate|unique/i.test(err);
    return NextResponse.json({ error: clash ? "Someone else changed the targets just now; reload and try again" : describeTargetStoreError(err) }, { status: clash ? 409 : 500 });
  }
  const next = replayTargets([...log, entry]);
  await noticeApproval(who.org_id!, id, { step: "targets", what: "Process targets", event: p.kind === "proposed" ? "request" : p.kind === "approved" ? "approved" : "withdrawn", ext: uc.ext_id, by: who.id, link: `/admin/federal/use-cases/${id}/targets`, ref: entry.hash.slice(0, 8) });
  return NextResponse.json({ ok: true, kind: p.kind, hash: entry.hash, version: next.approved?.version ?? 0, pending: next.pending?.version ?? null });
}
