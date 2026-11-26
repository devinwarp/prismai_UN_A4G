import { NextResponse } from "next/server";
import { noticeApproval } from "@/lib/un/inbox-service";
import { bad, forbidden, notFound, requirePermission } from "@/lib/api-auth";
import { resolveApprover, type Approver } from "@/lib/un/approvers";
import { withGovernance } from "@/lib/un/approvers";
import { approversForUseCase } from "@/lib/un/approvers-store";
import { isUuid } from "@/lib/un/model";
import { loadUseCase } from "@/lib/un/sijil-store";
import { appendTestLog, loadTestLog, requiredFor } from "@/lib/un/test-set-store";
import { appendTest, plan, replayTestSet, review, verifyTest, type Action } from "@/lib/un/test-sets";

type Ctx = { params: Promise<{ id: string }> };
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** GET ?profile=<job profile> → the test set of that profile: the tests, version, approval, coverage and chain
 * status, so a screen can show it. Read-only: any signed-in role may read it. */
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const who = await requirePermission("view");
  if (who instanceof NextResponse) return who;
  const profile = text(new URL(request.url).searchParams.get("profile"), 120);
  if (!profile) return bad("profile is required");
  const need = await requiredFor(who.org_id!, id, profile);
  if (!need.ok) return NextResponse.json({ error: need.error }, { status: need.status });
  const log = await loadTestLog(who.org_id!, id, profile);
  const state = replayTestSet(log);
  const chain = verifyTest(log);
  return NextResponse.json({ state, review: review(state, need.required), chain, required: need.required.length, entries: log.length });
}

/** POST { profile, action, ... } → one change to the test set of a job profile.
 *   create                                    start the set from the tests derived from the skill
 *   add     { title, family, task?, scenario?, slot?, expect: [{kind,text}], gates? }
 *   edit    { id, changes: { title?, expect?, gates?, scenario? }, reason? }
 *   retire  { id, reason, waiver_approver? }  "delete": the test stays in the log; the only test for a required slot needs an approver
 *   restore { id, reason }
 *   approve { approver?, note?, self_approval_reason? }   lock a version at its hash; the set must have no coverage gap
 *   withdraw { reason }
 * Changing the set needs scenario.edit; approving or withdrawing needs scenario.approve. An approver is chosen from the
 * use case's list (process owner by default), never typed. Every change is one entry of a hash-chained log. */
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
  if (!["create", "add", "edit", "retire", "restore", "approve", "withdraw"].includes(String(act))) return bad("Unknown action");
  const uc = await loadUseCase(who.org_id!, id);
  if (!uc) return notFound();
  const need = await requiredFor(who.org_id!, id, profile);
  if (!need.ok) return NextResponse.json({ error: need.error }, { status: need.status });

  const log = await loadTestLog(who.org_id!, id, profile);
  const v = verifyTest(log);
  if (!v.ok) return NextResponse.json({ error: `The test-set log failed verification at entry ${v.broken_seq}: ${v.reason}` }, { status: 409 });
  const state = replayTestSet(log);

  const approvers = withGovernance(await approversForUseCase(who.org_id!, id));
  const pick = (choice: unknown): { ok: true; approver: Approver } | { ok: false; error: string } => resolveApprover(choice, approvers);
  let action: Action;
  switch (act) {
    case "create": action = { type: "create", profile, sop_id: need.sopId, required: need.required }; break;
    case "add": action = { type: "add", blueprint: { title: text(b.title, 200), family: b.family as never, task: typeof b.task === "string" ? b.task : null, scenario: b.scenario as never, slot: text(b.slot, 120) || undefined, expect: (Array.isArray(b.expect) ? b.expect : []) as never, gates: Array.isArray(b.gates) ? (b.gates as unknown[]).filter((g): g is string => typeof g === "string") : undefined } }; break;
    case "edit": action = { type: "edit", id: text(b.id, 80), changes: (b.changes && typeof b.changes === "object" ? b.changes : {}) as never, reason: text(b.reason, 500) || undefined }; break;
    case "retire": {
      let waiver: string | undefined;
      if (b.waiver_approver !== undefined && b.waiver_approver !== "") {
        const w = pick(b.waiver_approver);
        if (!w.ok) return bad(w.error);
        waiver = w.approver.title;
      }
      action = { type: "retire", id: text(b.id, 80), reason: text(b.reason, 500), waiver_approver: waiver };
      break;
    }
    case "restore": action = { type: "restore", id: text(b.id, 80), reason: text(b.reason, 500) }; break;
    case "approve": {
      const a = pick(b.approver);
      if (!a.ok) return bad(a.error);
      action = { type: "approve", approver: a.approver, note: text(b.note, 500) || undefined, self_approval_reason: text(b.self_approval_reason, 500) || undefined };
      break;
    }
    default: action = { type: "withdraw", reason: text(b.reason, 500) };
  }

  const p = plan(state, need.required, action, who.id);
  if (!p.ok) return bad(p.error);
  const entry = appendTest(log[log.length - 1] ?? null, p.kind, who.email ?? who.id, p.payload, new Date().toISOString());
  const err = await appendTestLog(who.org_id!, id, profile, entry);
  if (err) return NextResponse.json({ error: /duplicate|unique/i.test(err) ? "Someone else changed the test set just now; reload and try again" : err }, { status: /duplicate|unique/i.test(err) ? 409 : 500 });
  const next = replayTestSet([...log, entry]);
  // a test set is edited, not proposed: the first change asks for its approval (one open request per use case), and an approval or withdrawal closes it
  const event = p.kind === "approved" ? "approved" : p.kind === "withdrawn" ? "withdrawn" : "request";
  await noticeApproval(who.org_id!, id, { step: "tests", what: "The test set", event, ext: uc.ext_id, by: who.id, link: `/admin/federal/use-cases/${id}/tests`, ref: entry.hash.slice(0, 8) });
  return NextResponse.json({ ok: true, kind: p.kind, hash: entry.hash, version: next.version, draft: next.draft, ...(p.kind === "approved" ? { set_hash: p.payload.hash } : {}) });
}

