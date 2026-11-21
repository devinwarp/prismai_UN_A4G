import { NextResponse } from "next/server";
import { bad, requireAdmin } from "@/lib/api-auth";
import { appKbStore } from "@/lib/un/kb-store-app";
import { decide, editBank, fixMiss, propose, runBank, runTasks, skillFromTuner } from "@/lib/un/tuning-service";
import type { Target } from "@/lib/un/tuning-versions";

/** POST { op, ... } → one action of the tuning screen. Every op changes stored state (a run, a proposal,
 * a decision, a bank edit), so the whole route is behind requireAdmin: viewers (judges) are read-only.
 *   run_questions                       run the whole bank under the version in use
 *   run_tasks                           run the per-task evals against the real agent code path
 *   propose { target, value, summary }  record a scored proposal (a settings config, or a skill's rule lines)
 *   fix { question_id }                 propose the best verified fix for one tuning-question miss
 *   from_tuner { profile }              propose rule lines from the per-use-case tuner (simulated optimiser)
 *   decide { id, decision, comment }    a person approves or rejects a proposed version
 *   bank { action, question | id }      add, update or delete a question
 * A proposal changes nothing until a person approves it. */
export async function POST(request: Request) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const ctx = { store: appKbStore(who.org_id!) };
  const actor = who.email ?? who.id;
  const str = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max) : "");
  try {
    switch (b.op) {
      case "run_questions": return NextResponse.json({ results: (await runBank(ctx, actor)).length });
      case "run_tasks": return NextResponse.json({ results: (await runTasks(ctx, actor)).length });
      case "propose": {
        const target = str(b.target, 80) as Target;
        const v = await propose(ctx, { target, value: b.value as never, summary: str(b.summary) || "Edited from the tuning screen", actor });
        return NextResponse.json({ id: v.id });
      }
      case "fix": {
        const r = await fixMiss(ctx, { question_id: str(b.question_id, 40), actor });
        return NextResponse.json({ id: r.proposed?.id ?? null, summary: r.summary, alternatives: r.alternatives });
      }
      case "from_tuner": return NextResponse.json({ id: (await skillFromTuner(ctx, { profile: str(b.profile, 80), actor })).id });
      case "decide": {
        if (b.decision !== "approve" && b.decision !== "reject") return bad('decision must be "approve" or "reject"');
        const v = await decide(ctx, { id: str(b.id, 120), decision: b.decision, actor, comment: str(b.comment, 1000) });
        return NextResponse.json({ id: v.id, status: v.status });
      }
      case "bank": {
        if (b.action !== "delete" && (!b.question || typeof b.question !== "object")) return bad("question is required");
        const e = b.action === "delete" ? { action: "delete" as const, id: str(b.id, 40) } : { action: b.action === "update" ? ("update" as const) : ("add" as const), question: b.question as never };
        return NextResponse.json({ size: (await editBank(ctx, e, actor)).length });
      }
      default: return bad("unknown op");
    }
  } catch (e) {
    return bad(e instanceof Error ? e.message : "The request failed.");
  }
}
