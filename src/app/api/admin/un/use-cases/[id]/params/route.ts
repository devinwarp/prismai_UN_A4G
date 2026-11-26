import { NextResponse } from "next/server";
import { noticeApproval } from "@/lib/un/inbox-service";
import { bad, forbidden, notFound, requirePermission } from "@/lib/api-auth";
import { resolveApprover } from "@/lib/un/approvers";
import { withGovernance } from "@/lib/un/approvers";
import { approversForUseCase } from "@/lib/un/approvers-store";
import { isUuid } from "@/lib/un/model";
import { loadUseCase } from "@/lib/un/sijil-store";
import { requiredFor } from "@/lib/un/test-set-store";
import { appendParamLog, loadParamLog } from "@/lib/un/verdict-param-store";
import { appendParam, DEFAULT_PARAMS, FLOORS, planParams, replayParams, verifyParams, type ParamAction } from "@/lib/un/verdict-params";

type Ctx = { params: Promise<{ id: string }> };
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** GET ?profile=<job profile> → the verdict parameters of that profile: the proposal waiting, the approval in force,
 * the governance floors and the defaults, and the chain status. Read-only: any signed-in role may read it. */
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const who = await requirePermission("view");
  if (who instanceof NextResponse) return who;
  const profile = text(new URL(request.url).searchParams.get("profile"), 120);
  if (!profile) return bad("profile is required");
  const need = await requiredFor(who.org_id!, id, profile);
  if (!need.ok) return NextResponse.json({ error: need.error }, { status: need.status });
  const log = await loadParamLog(who.org_id!, id, profile);
  return NextResponse.json({ state: replayParams(log), floors: FLOORS, defaults: DEFAULT_PARAMS, chain: verifyParams(log), entries: log.length });
}

/** POST { profile, action, ... } → one change to the verdict parameters of a job profile.
 *   propose  { params, note? }                 thresholds, checked against the governance floors
 *   approve  { approver?, self_approval_reason? }   lock the proposal at its hash
 *   withdraw { reason }
 * Proposing needs scenario.edit; approving or withdrawing needs scenario.approve. The approver is chosen from the use
 * case's list (process owner by default), never typed. Every change is one entry of a hash-chained log. */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const who = await requirePermission(["scenario.edit", "scenario.approve"], { useCaseId: id });
  if (who instanceof NextResponse) return who;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const profile = text(b.profile, 120);
  const act = b.action;
  // permission first, before any state is looked at
  const may = act === "approve" || act === "withdraw" ? who.decide("scenario.approve") : who.decide("scenario.edit");
  if (!may.ok) return forbidden(may.reason);
  if (!profile) return bad("profile is required");
  if (!["propose", "approve", "withdraw"].includes(String(act))) return bad("Unknown action");
  const uc = await loadUseCase(who.org_id!, id);
  if (!uc) return notFound();
  const need = await requiredFor(who.org_id!, id, profile);
  if (!need.ok) return NextResponse.json({ error: need.error }, { status: need.status });

  const log = await loadParamLog(who.org_id!, id, profile);
  const v = verifyParams(log);
  if (!v.ok) return NextResponse.json({ error: `The verdict-parameter log failed verification at entry ${v.broken_seq}: ${v.reason}` }, { status: 409 });
  const state = replayParams(log);

  let action: ParamAction;
  if (act === "propose") action = { type: "propose", params: b.params, note: text(b.note, 500) || undefined };
  else if (act === "approve") {
    const a = resolveApprover(b.approver, withGovernance(await approversForUseCase(who.org_id!, id)));
    if (!a.ok) return bad(a.error);
    action = { type: "approve", approver: a.approver, self_approval_reason: text(b.self_approval_reason, 500) || undefined };
  } else action = { type: "withdraw", reason: text(b.reason, 500) };

  const p = planParams(state, action, who.id);
  if (!p.ok) return bad(p.error);
  const entry = appendParam(log[log.length - 1] ?? null, p.kind, who.email ?? who.id, p.payload, new Date().toISOString());
  const err = await appendParamLog(who.org_id!, id, profile, entry);
  if (err) return NextResponse.json({ error: /duplicate|unique/i.test(err) ? "Someone else changed the parameters just now; reload and try again" : err }, { status: /duplicate|unique/i.test(err) ? 409 : 500 });
  const next = replayParams([...log, entry]);
  await noticeApproval(who.org_id!, id, { step: "tests", what: "Verdict parameters", event: p.kind === "proposed" ? "request" : p.kind === "approved" ? "approved" : "withdrawn", ext: uc.ext_id, by: who.id, link: `/admin/federal/use-cases/${id}/tests`, ref: entry.hash.slice(0, 8) });
  return NextResponse.json({ ok: true, kind: p.kind, hash: entry.hash, version: next.approved?.version ?? 0, pending: next.pending?.version ?? null, ...(p.kind === "approved" ? { params_hash: p.payload.hash } : {}) });
}
