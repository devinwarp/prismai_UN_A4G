import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bad, notFound, requireAdmin } from "@/lib/api-auth";
import { isUuid } from "@/lib/un/model";
import { headOf, loadRun, signatureOf, signRun, storeTraceRows, verifyRun, verifyStoredRows, writeSignedVerdict } from "@/lib/un/runs";
import { SCENARIOS } from "@/lib/un/scenarios";

/** POST { decision: "SIGN" | "WITHHOLD", comment } → the human final approval of a
 * finished use-case run (I-4). It appends a hash-chained HUMAN_SIGNATURE record as the
 * last record and, only for SIGN, writes the verdict onto the use case together with the
 * run id, head hash and signer (the database trigger refuses a verdict without them).
 * Calling it again on a run that was already signed repeats the verdict write, so a
 * failure between the two steps can be healed. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const b = (await request.json().catch(() => ({}))) as { decision?: unknown; comment?: unknown };
  if (b.decision !== "SIGN" && b.decision !== "WITHHOLD") return bad('decision must be "SIGN" or "WITHHOLD"');
  const comment = typeof b.comment === "string" ? b.comment.trim().slice(0, 1000) : "";
  if (b.decision === "WITHHOLD" && !comment) return bad("Withholding approval needs a comment");

  const row = await loadRun(who.org_id!, id);
  if (!row) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  const sc = SCENARIOS[row.scenario_id];
  if (!sc) return bad("Unknown scenario");
  if (sc.kind !== "gate") return bad("Only a use-case scenario has a verdict to sign");
  if (!row.state.done) return bad("Release every step before signing");

  const v = verifyRun(row);
  if (!v.ok) return NextResponse.json({ error: `Trace log failed verification: ${v.reason}` }, { status: 409 });
  const healed = await storeTraceRows(id, row.state);
  if (healed) return NextResponse.json({ error: `Could not store trace rows: ${healed}` }, { status: 500 });
  const vr = await verifyStoredRows(id, row.state);
  if (!vr.ok) return NextResponse.json({ error: `Append-only trace rows disagree with the displayed log: ${vr.reason}` }, { status: 409 });

  // Already signed: do not sign twice, but repeat the verdict write in case it failed last time.
  const existing = signatureOf(row.state);
  if (existing) {
    const err = await writeSignedVerdict(who.org_id!, id, row.state);
    if (err) return NextResponse.json({ error: `Run is already signed; the verdict write failed: ${err}` }, { status: 500 });
    return NextResponse.json({ ok: true, already: true, decision: existing.signature!.decision });
  }

  let next;
  try {
    next = signRun(sc, row.state, { signer_id: who.id, role: who.role ?? "admin", decision: b.decision, comment }, () => new Date().toISOString());
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Could not sign");
  }
  // Optimistic guard, as in the step route: a double click must not sign twice.
  const { data, error } = await createAdminClient()
    .from("un_runs")
    .update({ state: next, head_hash: headOf(next), updated_at: new Date().toISOString() })
    .eq("id", id).eq("org_id", who.org_id!).eq("updated_at", row.updated_at)
    .select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "The run changed at the same time; refresh" }, { status: 409 });

  const rowErr = await storeTraceRows(id, next);
  if (rowErr) return NextResponse.json({ error: `Signed, but the trace row was not stored (retry heals it): ${rowErr}` }, { status: 500 });
  if (b.decision === "WITHHOLD") return NextResponse.json({ ok: true, decision: "WITHHOLD" });
  const verr = await writeSignedVerdict(who.org_id!, id, next);
  if (verr) return NextResponse.json({ error: `Signed, but the verdict was not written to the use case (retry heals it): ${verr}` }, { status: 500 });
  return NextResponse.json({ ok: true, decision: "SIGN" });
}
