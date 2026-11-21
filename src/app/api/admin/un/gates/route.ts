import { NextResponse } from "next/server";
import { bad, requireAdmin } from "@/lib/api-auth";
import { approvalFields, governanceApprovers, resolveApprover } from "@/lib/un/approvers";
import { replayGov } from "@/lib/un/gates";
import { loadGovLog } from "@/lib/un/gates-store";
import { commitGov } from "@/lib/un/gates-rerun";
import { GATES } from "@/lib/un/policy";
import { ID_RE, parseGateDef } from "@/lib/un/governance";

/** POST { gate: id, label, owner, category, evidence, requires?, rulesets?, kbQuery?, metric?, reason? } → adds an
 * admin-defined gate, or changes one this route added earlier (the shipped nine are not editable). The signed-in
 * sign-off is an approver chosen from the governance list (approver, required; see approvers.ts) and the signed-in
 * admin is recorded as who made the change; the entry goes into the hash-chained gate log and the affected verdicts are re-run as
 * NEW runs (old runs are never rewritten). Admin only: viewers and judges are read-only. */
export async function POST(request: Request) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b !== "object") return bad("Invalid JSON");
  const id = typeof b.gate === "string" ? b.gate : "";
  if (!ID_RE.test(id)) return bad("gate id must be lower-case letters, digits and underscores, 3 to 41 characters, starting with a letter");
  if (Object.hasOwn(GATES, id)) return bad("The shipped gates cannot be changed");
  const parsed = parseGateDef(b, { custom: true });
  if (!parsed.ok) return bad(parsed.error);
  const exists = !!replayGov(await loadGovLog(who.org_id!)).custom[id];
  const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 500) : "";
  if (exists && !reason) return bad("Changing a gate needs a reason");
  // an org-wide gate belongs to no single process, so there is no process owner to default to: the admin must choose
  const appr = resolveApprover(b.approver, governanceApprovers(), { defaultToOwner: false });
  if (!appr.ok) return bad(appr.error);
  const out = await commitGov(who.org_id!, who, exists ? "gate_changed" : "gate_added", { gate: id, def: parsed.def, signed_off_by: appr.approver.title, ...approvalFields(appr.approver), reason }, id);
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json({ ok: true, hash: out.hash, reruns: out.reruns });
}
