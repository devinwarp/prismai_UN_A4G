import { NextResponse } from "next/server";
import { chatCompletion } from "@/lib/llm";
import { createAdminClient } from "@/lib/supabase/admin";
import { bad, requireAdmin } from "@/lib/api-auth";
import { loadChunks } from "@/lib/un/kb";
import { headOf, loadRun, storeTraceRows, verifyRun, verifyStoredRows } from "@/lib/un/runs";
import { nextStep } from "@/lib/un/scenario";
import { loadHitlConfig, loadUnUseCases } from "@/lib/un/store";
import { SCENARIOS } from "@/lib/un/scenarios";

/** POST { llm?: boolean } → releases the next staged step. With llm the role
 * agents call the model (rules still decide the verdict); without, they run
 * in deterministic mode. A run whose log fails verification is not advanced. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  const { id } = await params;
  const row = await loadRun(who.org_id!, id);
  if (!row) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  const sc = SCENARIOS[row.scenario_id];
  if (!sc) return bad("Unknown scenario");
  if (row.state.done) return bad("All steps have been released");
  const v = verifyRun(row);
  if (!v.ok) return NextResponse.json({ error: `Trace log failed verification: ${v.reason}` }, { status: 409 });

  // Rows are written after the state update, so a failed insert leaves them
  // behind the log by a step; store what is missing first, then compare (C4-2).
  const healed = await storeTraceRows(id, row.state);
  if (healed) return NextResponse.json({ error: `Could not store trace rows: ${healed}` }, { status: 500 });
  const vr = await verifyStoredRows(id, row.state);
  if (!vr.ok) return NextResponse.json({ error: `Append-only trace rows disagree with the displayed log: ${vr.reason}` }, { status: 409 });

  const b = (await request.json().catch(() => ({}))) as { llm?: boolean };
  const useLlm = b.llm === true;
  if (useLlm && !(process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY)) {
    return bad("No model key configured; run in deterministic mode");
  }
  // I-2 / D-4: a use-case run takes the entity's HITL rules so a breach fails the human_final_approval gate.
  const ext = row.state.state?.ext_id;
  const uc = ext ? (await loadUnUseCases(who.org_id!)).find((u) => u.ext_id === ext) : undefined;
  const hitl = uc
    ? { config: await loadHitlConfig(who.org_id!), entity: uc.entity, facts: { client_facing: uc.client_facing, affects_rights: uc.affects_rights, irreversible: uc.irreversible } }
    : undefined;
  const next = await nextStep(sc, row.state, {
    hitl,
    now: () => new Date().toISOString(),
    chunks: loadChunks(),
    llm: useLlm
      ? (system, user) => chatCompletion({ system, messages: [{ role: "user", content: user }], json: true, maxTokens: 900 })
      : undefined,
  });
  // Optimistic guard: a double click must not release two steps.
  const { data, error } = await createAdminClient()
    .from("un_runs")
    .update({ state: next, head_hash: headOf(next), updated_at: new Date().toISOString() })
    .eq("id", id).eq("org_id", who.org_id!).eq("updated_at", row.updated_at)
    .select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Another step was released at the same time; refresh" }, { status: 409 });
  const rowErr = await storeTraceRows(id, next);
  if (rowErr) return NextResponse.json({ error: `Step released but trace rows were not stored (retry will heal): ${rowErr}` }, { status: 500 });
  return NextResponse.json({ ok: true, step: next.steps[next.steps.length - 1]?.step });
}
