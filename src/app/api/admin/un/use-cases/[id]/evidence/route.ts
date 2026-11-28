import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bad, notFound, requireAdmin } from "@/lib/api-auth";
import { evidenceEffective, latestEvidenceRun } from "@/lib/un/evidence-store";
import { currentVerdict, evidenceLines, evidenceScenario, evidenceScenarioId, evidenceSteps, missingEvidence, nextAdhocEventId, REQUESTED_LEVELS, startEvidenceRun } from "@/lib/un/evidence-scenario";
import { loadChunks } from "@/lib/un/kb";
import { isUuid } from "@/lib/un/model";
import { headOf, signatureOf, storeTraceRows, verifyRun, verifyStoredRows } from "@/lib/un/runs";
import { adhocStep, MAX_ADHOC } from "@/lib/un/scenario";
import { loadUseCase } from "@/lib/un/sijil-store";
import { loadHitlConfig } from "@/lib/un/store";

// The verdict path of any use case (evidence-scenario.ts): the evidence of each gate is recorded by a person, the ordinary round turns it into a verdict, and a person
// signs the verdict through the ordinary sign route (runs/[id]/sign). Nothing here is staged.

async function view(orgId: string, uc: NonNullable<Awaited<ReturnType<typeof loadUseCase>>>) {
  const { facts, effective } = await evidenceEffective(orgId, uc);
  const row = await latestEvidenceRun(orgId, uc.ext_id);
  const signed = row ? signatureOf(row.state) : null;
  const lines = evidenceLines(effective, row?.state ?? null);
  const verdict = currentVerdict(row?.state ?? null);
  return {
    facts, ruleset: effective.ruleset, lines, missing: missingEvidence(lines),
    run: row ? { id: row.id, requested: row.state.state?.requested ?? null, steps: row.state.steps.length, verdict, signed: signed ? { decision: signed.signature!.decision, by: signed.signature!.signer_id, at: signed.timestamp, comment: signed.signature!.comment } : null } : null,
    signedVerdict: uc.verdict ?? null,
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const uc = await loadUseCase(who.org_id!, id);
  if (!uc) return notFound();
  return NextResponse.json(await view(who.org_id!, uc));
}

/** POST { action: "start", requested } → opens an evidence run at the autonomy level the process owner asks for (a new one after a signed one).
 *  POST { action: "record", gate, status: "pass" | "fail" | "fix_declared", note, change? } → records one gate's evidence; the verdict is worked out by the round.
 *  A gate that fails is lifted only by a declared fix (with its change reference) and then a re-test (evidence-scenario.ts evidenceSteps). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const uc = await loadUseCase(who.org_id!, id);
  if (!uc) return notFound();
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = who.org_id!;
  const db = createAdminClient();
  const { facts, effective } = await evidenceEffective(orgId, uc);
  const row = await latestEvidenceRun(orgId, uc.ext_id);
  const open = row && !signatureOf(row.state) ? row : null;

  if (b.action === "start") {
    if (open) return bad("An evidence run is already open for this use case: record its evidence, then sign it.");
    const requested = REQUESTED_LEVELS.find((l) => l === b.requested);
    if (!requested) return bad(`requested must be one of ${REQUESTED_LEVELS.join(", ")}`);
    const runId = crypto.randomUUID();
    const state = startEvidenceRun(uc.ext_id, `${evidenceScenarioId(uc.ext_id)}-${runId.slice(0, 8)}`, { clientFacing: facts.client_facing, requested });
    const { error } = await db.from("un_runs").insert({ id: runId, org_id: orgId, scenario_id: evidenceScenarioId(uc.ext_id), state, head_hash: headOf(state), created_by: who.id });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, run_id: runId });
  }

  if (b.action === "record") {
    if (!open) return bad("Open an evidence run first.");
    const gate = String(b.gate ?? "");
    const current = evidenceLines(effective, open.state).find((l) => l.id === gate)?.status ?? "unknown";
    const step = evidenceSteps({ gate, status: String(b.status ?? ""), note: typeof b.note === "string" ? b.note : "", change: typeof b.change === "string" ? b.change : "" }, effective, current, nextAdhocEventId(open.scenario_id, open.state));
    if (!step.ok) return bad(step.error);
    if (open.state.steps.filter((s) => s.adhoc).length + step.inputs.length > MAX_ADHOC) return bad(`A run holds at most ${MAX_ADHOC} recorded steps. Sign or withhold this one and open a new evidence run.`);
    const v = verifyRun(open);
    if (!v.ok) return NextResponse.json({ error: `Trace log failed verification: ${v.reason}` }, { status: 409 });
    const healed = await storeTraceRows(open.id, open.state);
    if (healed) return NextResponse.json({ error: `Could not store trace rows: ${healed}` }, { status: 500 });
    const vr = await verifyStoredRows(open.id, open.state);
    if (!vr.ok) return NextResponse.json({ error: `Append-only trace rows disagree with the displayed log: ${vr.reason}` }, { status: 409 });
    let next = open.state;
    try {
      const env = { hitl: { config: await loadHitlConfig(), entity: uc.entity, facts }, effective, now: () => new Date().toISOString(), chunks: loadChunks() };
      for (const input of step.inputs) next = await adhocStep(evidenceScenario(uc.ext_id, facts.client_facing), next, input, env);
    } catch (e) {
      return bad(e instanceof Error ? e.message : "Invalid evidence");
    }
    const { data, error } = await db.from("un_runs").update({ state: next, head_hash: headOf(next), updated_at: new Date().toISOString() })
      .eq("id", open.id).eq("org_id", orgId).eq("updated_at", open.updated_at).select("id").maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "The run changed at the same time; refresh" }, { status: 409 });
    const rowErr = await storeTraceRows(open.id, next);
    if (rowErr) return NextResponse.json({ error: `Evidence recorded but trace rows were not stored (retry heals it): ${rowErr}` }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  return bad('action must be "start" or "record"');
}
