import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { loadRun } from "@/lib/un/runs";
import { tamperLast } from "@/lib/un/tamper";

/** GET → the run as a JSON download that `npm run verify-log <file>` accepts.
 * POST → tamper demo: edits an in-memory copy of the last record and returns
 * what the verifier says. Nothing is written; the stored run is untouched. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  const { id } = await params;
  const row = await loadRun(who.org_id!, id);
  if (!row) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  const body = JSON.stringify({ run_id: row.state.run_id, scenario_id: row.scenario_id, head_hash: row.head_hash, state: row.state }, null, 2);
  return new NextResponse(body, {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${row.state.run_id}.json"` },
  });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  const { id } = await params;
  const row = await loadRun(who.org_id!, id);
  if (!row) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  return NextResponse.json(tamperLast(row.state.log));
}
