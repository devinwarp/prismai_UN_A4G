import { NextResponse } from "next/server";
import { CHAT_MODEL, chatCompletion } from "@/lib/llm";
import { createAdminClient } from "@/lib/supabase/admin";
import { bad, requireAdmin } from "@/lib/api-auth";
import { effectiveFor } from "@/lib/un/gates-store";
import { loadChunks } from "@/lib/un/kb";
import { headOf, loadRun, storeTraceRows, verifyRun, verifyStoredRows } from "@/lib/un/runs";
import { adhocError, adhocStep, type AdhocInput } from "@/lib/un/scenario";
import { loadHitlConfig, loadUnUseCases } from "@/lib/un/store";
import { scenarioFor } from "@/lib/un/evidence-scenario";

/** POST { summary, gate?, status?, recipients, expected?, llm? } → runs one
 * operator-written step on a gate run: same agents, same policy engine, and
 * hash-chained trace records as a scenario step. Same guards as the release route. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  const { id } = await params;
  const b = (await request.json().catch(() => null)) as (AdhocInput & { llm?: boolean }) | null;
  if (!b || typeof b !== "object") return bad("Invalid JSON");
  const row = await loadRun(who.org_id!, id);
  if (!row) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  const invalid = adhocError(b, row.state.state?.customGates);
  if (invalid) return bad(invalid);
  const sc = scenarioFor(row.scenario_id);
  if (!sc || sc.kind !== "gate") return bad("Ad-hoc steps are only for use-case scenarios");
  if (row.state.log[row.state.log.length - 1]?.signature) return bad("This run is already signed");
  const v = verifyRun(row);
  if (!v.ok) return NextResponse.json({ error: `Trace log failed verification: ${v.reason}` }, { status: 409 });
  const healed = await storeTraceRows(id, row.state);
  if (healed) return NextResponse.json({ error: `Could not store trace rows: ${healed}` }, { status: 500 });
  const vr = await verifyStoredRows(id, row.state);
  if (!vr.ok) return NextResponse.json({ error: `Append-only trace rows disagree with the displayed log: ${vr.reason}` }, { status: 409 });
  const useLlm = b.llm === true;
  if (useLlm && !(process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY)) return bad("No model key configured; run in deterministic mode");

  const ext = row.state.state?.ext_id;
  const uc = ext ? (await loadUnUseCases(who.org_id!)).find((u) => u.ext_id === ext) : undefined;
  const hitl = uc
    ? { config: await loadHitlConfig(), entity: uc.entity, facts: { client_facing: uc.client_facing, affects_rights: uc.affects_rights, irreversible: uc.irreversible } }
    : undefined;
  let next;
  try {
    next = await adhocStep(sc, row.state, b, {
      hitl,
      effective: uc ? await effectiveFor(who.org_id!, uc) : undefined,
      now: () => new Date().toISOString(),
      chunks: loadChunks(),
      model: useLlm ? CHAT_MODEL : undefined,
      llm: useLlm ? (system, user) => chatCompletion({ system, messages: [{ role: "user", content: user }], json: true, maxTokens: 900 }) : undefined,
    });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Invalid step");
  }
  const { data, error } = await createAdminClient()
    .from("un_runs")
    .update({ state: next, head_hash: headOf(next), updated_at: new Date().toISOString() })
    .eq("id", id).eq("org_id", who.org_id!).eq("updated_at", row.updated_at)
    .select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "The run changed at the same time; refresh" }, { status: 409 });
  const rowErr = await storeTraceRows(id, next);
  if (rowErr) return NextResponse.json({ error: `Step added but trace rows were not stored (retry will heal): ${rowErr}` }, { status: 500 });
  return NextResponse.json({ ok: true, step: next.steps[next.steps.length - 1]?.step });
}
