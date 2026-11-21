import { NextResponse } from "next/server";
import { bad, requireAdmin } from "@/lib/api-auth";
import { replayGov } from "@/lib/un/gates";
import { loadGovLog } from "@/lib/un/gates-store";
import { commitGov } from "@/lib/un/gates-rerun";
import { GATES } from "@/lib/un/policy";
import { ID_RE, parseGateDef } from "@/lib/un/governance";

/** POST { gate: id, label, owner, category, evidence, requires?, rulesets?, kbQuery?, metric?, reason? } → adds an
 * admin-defined gate, or changes one this route added earlier (the shipped nine are not editable). The signed-in
 * admin is the sign-off; the entry goes into the hash-chained gate log and the affected verdicts are re-run as
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
  const out = await commitGov(who.org_id!, who, exists ? "gate_changed" : "gate_added", { gate: id, def: parsed.def, signed_off_by: who.email ?? who.id, reason }, id);
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json({ ok: true, hash: out.hash, reruns: out.reruns });
}
