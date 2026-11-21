import { NextResponse } from "next/server";
import { bad, forbidden, notFound, requirePermission } from "@/lib/api-auth";
import { approvalFields, resolveApprover } from "@/lib/un/approvers";
import { approversForUseCase } from "@/lib/un/approvers-store";
import { effectiveGates } from "@/lib/un/gates";
import { factsOf, loadGov } from "@/lib/un/gates-store";
import { commitGov } from "@/lib/un/gates-rerun";
import { isUuid } from "@/lib/un/model";
import { loadUseCase } from "@/lib/un/sijil-store";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** POST { action: "add", gate, reason, source?, approver? } → this use case takes on a gate of its own (add only: it
 * can never drop a rule-set gate). POST { action: "waive", gate, approver?, reason } → waives a gate for this use case
 * through governance: an approver, a reason and a hash-chained log entry; the waiver stays visible on the use case
 * and on the verdict trace. The approver is chosen from the use case's list (the process owner of its SOP, which is
 * the default, or the SOP's job titles; see approvers.ts), never typed. Admin only. The verdict is re-run as a NEW run. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const who = await requirePermission(["gate.add", "gate.waive"], { useCaseId: id });
  if (who instanceof NextResponse) return who;
  const uc = await loadUseCase(who.org_id!, id);
  if (!uc) return notFound();
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const gate = text(b.gate, 60);
  const reason = text(b.reason, 500);
  if (!reason) return bad("A reason is required");
  const gov = await loadGov(who.org_id!);
  const eff = effectiveGates({ ext: uc.ext_id, facts: factsOf(uc), gov });
  if (b.action === "add") {
    const may = who.decide("gate.add");
    if (!may.ok) return forbidden(may.reason);
    if (!Object.hasOwn(eff.catalog, gate)) return bad("Unknown gate");
    if (eff.gates.some((g) => g.id === gate)) return bad("This gate already applies to the use case");
    const source = b.source === "task" ? "task" : b.source === "admin" ? "admin" : "requirement";
    const appr = resolveApprover(b.approver, await approversForUseCase(who.org_id!, id));
    if (!appr.ok) return bad(appr.error);
    const out = await commitGov(who.org_id!, who, "use_case_gate", { use_case_id: uc.id, ext_id: uc.ext_id, gate, reason, source, ...approvalFields(appr.approver) }, gate);
    return out.ok ? NextResponse.json({ ok: true, hash: out.hash, reruns: out.reruns }) : NextResponse.json({ error: out.error }, { status: out.status });
  }
  if (b.action === "waive") {
    const may = who.decide("gate.waive");
    if (!may.ok) return forbidden(may.reason);
    const appr = resolveApprover(b.approver, await approversForUseCase(who.org_id!, id));
    if (!appr.ok) return bad(appr.error);
    const g = eff.gates.find((x) => x.id === gate);
    if (!g) return bad("That gate does not apply to this use case");
    if (g.waiver) return bad("That gate is already waived for this use case");
    const out = await commitGov(who.org_id!, who, "waiver", { use_case_id: uc.id, ext_id: uc.ext_id, gate, ...approvalFields(appr.approver), reason }, gate);
    return out.ok ? NextResponse.json({ ok: true, hash: out.hash, reruns: out.reruns }) : NextResponse.json({ error: out.error }, { status: out.status });
  }
  return bad('action must be "add" or "waive"');
}
