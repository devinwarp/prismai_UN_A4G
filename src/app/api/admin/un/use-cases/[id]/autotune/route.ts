import { NextResponse } from "next/server";
import { bad, forbidden, notFound, requirePermission } from "@/lib/api-auth";
import { appendAuto, DEFAULT_BUDGET, modelCallsToday, noticeOf, planStart, planSwitch, planThreshold, replayAuto, verifyAuto, type AutoEntry } from "@/lib/un/auto-tune";
import { appendAutoLog, loadAutoLog } from "@/lib/un/autotune-store";
import { runAutoTune } from "@/lib/un/autotune-service";
import { appKbStore } from "@/lib/un/kb-store-app";
import { chatCompletion } from "@/lib/llm";
import { isUuid } from "@/lib/un/model";
import { loadAttachedSop } from "@/lib/un/profiles-store";
import { loadUseCase } from "@/lib/un/sijil-store";
import { decide, loadState } from "@/lib/un/tuning-service";
import { heldOutAlignment } from "@/lib/un/auto-tune";

type Ctx = { params: Promise<{ id: string }> };
/** A cycle scores the agent many times: allow a long hosted request. */
export const maxDuration = 300;

const unreadable = (e: unknown) => NextResponse.json({ error: e instanceof Error ? e.message : "The auto-tuning log could not be read" }, { status: 503 });
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** The model that proposes edits: TUNING_LLM_MODEL, else the agent's. Absent when no model is configured: the deterministic proposer still runs. */
const tuningChat = () => {
  if (!(process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY)) return undefined;
  const model = process.env.TUNING_LLM_MODEL || process.env.AGENT_LLM_MODEL || undefined;
  return ({ system, user }: { system: string; user: string }) => chatCompletion({ system, messages: [{ role: "user", content: user }], maxTokens: 1200, timeoutMs: 60_000, json: true, ...(model ? { model } : {}) });
};

/** GET → the tuning agent's state for this use case: the switch, the limit, the cycles, the notice for the dashboard, and the changes it
 * proposed that wait for a person. Any signed-in role. */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const who = await requirePermission("view");
  if (who instanceof NextResponse) return who;
  if (!(await loadUseCase(who.org_id!, id))) return notFound();
  let log: AutoEntry[];
  try { log = await loadAutoLog(who.org_id!, id); } catch (e) { return unreadable(e); }
  const state = replayAuto(log);
  const sop = await loadAttachedSop(who.org_id!, id);
  const waiting = sop ? (await loadState({ store: appKbStore(who.org_id!), sopId: sop })).versions.filter((v) => v.status === "proposed").map((v) => ({ id: v.id, target: v.target, summary: v.summary, by: v.proposed_by, at: v.proposed_at, held_out_before: heldOutAlignment(v.before), held_out_after: heldOutAlignment(v.after) })) : [];
  return NextResponse.json({ state, notice: noticeOf(state), chain: verifyAuto(log), budget: DEFAULT_BUDGET, model_calls_today: modelCallsToday(state), waiting });
}

/** POST { action, ... }
 *   switch   { on }                  the business process owner switches automatic changes on or off (autotune.switch)
 *   threshold { value }              the held-out alignment limit above which every change waits for a person, 0.90 to 0.98 (autotune.switch)
 *   run                              one tuning cycle (tuning.run: an operator or the process owner). Switched on, it may apply low-risk fixes
 *                                    that pass the no-regression test; switched off, it only proposes.
 *   decide   { id, decision, comment? }   approve or reject a change that waited for a person (tuning.decide)
 * Permission is checked before any state is read. */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const who = await requirePermission(["autotune.switch", "tuning.run", "tuning.decide"], { useCaseId: id });
  if (who instanceof NextResponse) return who;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const act = String(b.action);
  const need = act === "switch" || act === "threshold" ? "autotune.switch" : act === "run" ? "tuning.run" : act === "decide" ? "tuning.decide" : null;
  if (!need) return bad("Unknown action");
  const may = who.decide(need);
  if (!may.ok) return forbidden(may.reason);
  if (!(await loadUseCase(who.org_id!, id))) return notFound();
  const actor = who.email ?? who.id;
  let log: AutoEntry[];
  try { log = await loadAutoLog(who.org_id!, id); } catch (e) { return unreadable(e); }
  const v = verifyAuto(log);
  if (!v.ok) return NextResponse.json({ error: `The auto-tuning log failed verification at entry ${v.broken_seq}: ${v.reason}` }, { status: 409 });
  const state = replayAuto(log);
  const write = async (kind: AutoEntry["kind"], payload: Record<string, unknown>) => {
    const cur = await loadAutoLog(who.org_id!, id);
    const e = appendAuto(cur[cur.length - 1] ?? null, kind, actor, payload, new Date().toISOString());
    const err = await appendAutoLog(who.org_id!, id, e);
    return err ? NextResponse.json({ error: /duplicate|unique/i.test(err) ? "Someone else changed this just now; reload and try again" : err }, { status: /duplicate|unique/i.test(err) ? 409 : 500 }) : null;
  };

  if (act === "switch" || act === "threshold") {
    const p = act === "switch" ? planSwitch(state, b.on === true, actor) : planThreshold(state, b.value, actor);
    if (!p.ok) return bad(p.error);
    const fail = await write(p.kind, p.payload);
    return fail ?? NextResponse.json({ ok: true });
  }

  const sop = await loadAttachedSop(who.org_id!, id);
  if (!sop) return NextResponse.json({ error: "Attach an SOP to this use case first" }, { status: 409 });
  const ctx = { store: appKbStore(who.org_id!), sopId: sop };

  if (act === "decide") {
    if (b.decision !== "approve" && b.decision !== "reject") return bad('decision must be "approve" or "reject"');
    try {
      const ver = await decide(ctx, { id: text(b.id, 120), decision: b.decision, actor, comment: text(b.comment, 1000) });
      return NextResponse.json({ ok: true, id: ver.id, status: ver.status });
    } catch (e) { return bad(e instanceof Error ? e.message : "The request failed"); }
  }

  // run one cycle: the dashboard says "tuning" from the moment it starts until it ends, whatever happens in between
  const start = planStart(state, actor);
  if (!start.ok) return NextResponse.json({ error: start.error }, { status: 429 });
  const failStart = await write("started", start.payload);
  if (failStart) return failStart;
  const record = await runAutoTune(ctx, { state, actor, mode: start.mode, chat: tuningChat(), modelCallsLeft: Math.max(0, DEFAULT_BUDGET.modelCallsPerDay - modelCallsToday(state)) });
  const failEnd = await write("finished", { record });
  if (failEnd) return failEnd;
  return NextResponse.json({ ok: true, record });
}
