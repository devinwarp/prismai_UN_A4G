import { NextResponse } from "next/server";
import { noticeAsk } from "@/lib/un/inbox-service";
import { bad, notFound, requireAdmin, requirePermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { evalSetFor } from "@/lib/un/evalset";
import { saveEvalRun } from "@/lib/un/eval-store";
import { isUuid } from "@/lib/un/model";
import { loadUseCase } from "@/lib/un/sijil-store";
import { baselineConfig } from "@/lib/un/subject";
import { approvalState, configOf, designationOf, runTuningCycle } from "@/lib/un/tuning";
import { appendLog, loadLog, resetTuning } from "@/lib/un/tuning-store";

type Ctx = { params: Promise<{ id: string }> };

/** POST → run a tuning cycle with the SIMULATED optimiser: tune on the tuning cases, certify on the
 * held-out cases, burn and replace any held-out case that fails, repeat. Continues from the log. */
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const who = await requirePermission("tuning.run", { useCaseId: id });
  if (who instanceof NextResponse) return who;
  const uc = await loadUseCase(who.org_id!, id);
  if (!uc) return notFound();
  const all = evalSetFor(uc.ext_id);
  if (!all.length) return bad(`No eval set for ${uc.ext_id} yet`);

  const log = await loadLog(who.org_id!, id);
  const state = approvalState(log);
  if (state === "approved") return NextResponse.json({ error: "Already approved. Reset to start again." }, { status: 409 });
  if (state === "ready") return NextResponse.json({ error: "Already certified. Approve it, or reset to start again." }, { status: 409 });

  const out = runTuningCycle({
    base: configOf(log) ?? baselineConfig(`${uc.ext_id}-agent`),
    all,
    designation: designationOf(log),
    actor: "optimiser (simulated)",
    now: () => new Date().toISOString(),
    prev: log[log.length - 1] ?? null,
  });
  for (const run of out.runs) {
    const saved = await saveEvalRun(who.org_id!, id, run);
    if ("error" in saved) return NextResponse.json({ error: saved.error }, { status: 500 });
  }
  const err = await appendLog(who.org_id!, id, out.entries);
  if (err) return NextResponse.json({ error: err }, { status: 500 });
  const after = approvalState([...log, ...out.entries]);
  if (after === "ready") await noticeAsk(who.org_id!, id, { step: "approval", key: `version:${id}`, kind: "version.ready", decisionKind: "version.approve", subject: `An agent version is certified and waits for a decision for ${uc.ext_id}`, body: `Version ${out.config.version} met the bar. A person signs or withholds approval: it is a decision for a person.`, link: `/admin/federal/use-cases/${id}/tuning`, by: who.id });
  return NextResponse.json({ entries: out.entries.length, stopped: out.stopped, version: out.config.version, state: after });
}

/** DELETE → clear the tuning log and eval runs for a fresh demo; an approved stage goes back to pilot. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const err = await resetTuning(who.org_id!, id);
  if (err) return NextResponse.json({ error: err }, { status: 500 });
  await createAdminClient().from("un_use_cases").update({ stage: "pilot", updated_at: new Date().toISOString() }).eq("id", id).eq("org_id", who.org_id!).eq("stage", "approved");
  return NextResponse.json({ ok: true });
}
