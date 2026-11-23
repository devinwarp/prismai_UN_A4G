import { NextResponse } from "next/server";
import { notFound, requirePermission } from "@/lib/api-auth";
import { isUuid } from "@/lib/un/model";
import { loadLedger } from "@/lib/un/cost-ledger-store";
import { loadRelease } from "@/lib/un/release-store";
import { loadUseCase } from "@/lib/un/sijil-store";
import { targetsHash } from "@/lib/un/targets";

type Ctx = { params: Promise<{ id: string }> };

/** GET → is the use case ready to be approved and put into production? The answer the approval and the go-live give (they refuse with
 * the same blockers): per job profile and for the use case's targets, with what to fix. Read-only: any signed-in role. */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const who = await requirePermission("view");
  if (who instanceof NextResponse) return who;
  if (!(await loadUseCase(who.org_id!, id))) return notFound();
  const r = await loadRelease(who.org_id!, id);
  // the approver sees what the whole process cost: every model call and tool call recorded for generation, pilots, judging, tuning and production
  const ledger = await loadLedger(who.org_id!, id, r.profiles);
  return NextResponse.json({ ok: r.ok, blockers: r.blockers, reports: r.reports, profiles: r.profiles, targets_hash: r.targets ? targetsHash(r.targets) : null, cost: { summary: ledger.summary, entries: ledger.entries.map(({ usage: _u, ...e }) => e) } });
}
