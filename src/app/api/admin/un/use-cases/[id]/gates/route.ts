import { NextResponse } from "next/server";
import { bad, notFound, requireAdmin } from "@/lib/api-auth";
import { effectiveGates } from "@/lib/un/gates";
import { factsOf, loadGov } from "@/lib/un/gates-store";
import { commitGov } from "@/lib/un/gates-rerun";
import { isUuid } from "@/lib/un/model";
import { loadUseCase } from "@/lib/un/sijil-store";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** POST { action: "add", gate, reason, source? } → this use case takes on a gate of its own (add only: it can never
 * drop a rule-set gate). POST { action: "waive", gate, approver, reason } → waives a gate for this use case through
 * governance: a named approver, a reason and a hash-chained log entry; the waiver stays visible on the use case and
 * on the verdict trace. Admin only. The verdict is re-run as a NEW run. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const uc = await loadUseCase(who.org_id!, id);
  if (!uc) return notFound();
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const gate = text(b.gate, 60);
  const reason = text(b.reason, 500);
  if (!reason) return bad("A reason is required");
  const gov = await loadGov(who.org_id!);
  const eff = effectiveGates({ ext: uc.ext_id, facts: factsOf(uc), gov });
  if (b.action === "add") {
    if (!Object.hasOwn(eff.catalog, gate)) return bad("Unknown gate");
    if (eff.gates.some((g) => g.id === gate)) return bad("This gate already applies to the use case");
    const source = b.source === "task" ? "task" : b.source === "admin" ? "admin" : "requirement";
    const out = await commitGov(who.org_id!, who, "use_case_gate", { use_case_id: uc.id, ext_id: uc.ext_id, gate, reason, source }, gate);
    return out.ok ? NextResponse.json({ ok: true, hash: out.hash, reruns: out.reruns }) : NextResponse.json({ error: out.error }, { status: out.status });
  }
  if (b.action === "waive") {
    const approver = text(b.approver, 120);
    if (!approver) return bad("A waiver needs a named approver");
    const g = eff.gates.find((x) => x.id === gate);
    if (!g) return bad("That gate does not apply to this use case");
    if (g.waiver) return bad("That gate is already waived for this use case");
    const out = await commitGov(who.org_id!, who, "waiver", { use_case_id: uc.id, ext_id: uc.ext_id, gate, approver, reason }, gate);
    return out.ok ? NextResponse.json({ ok: true, hash: out.hash, reruns: out.reruns }) : NextResponse.json({ error: out.error }, { status: out.status });
  }
  return bad('action must be "add" or "waive"');
}
