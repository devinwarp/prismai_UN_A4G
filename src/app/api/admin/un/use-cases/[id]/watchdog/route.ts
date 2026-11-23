import { createAdminClient } from "@/lib/supabase/admin";
import { loadRelease } from "@/lib/un/release-store";
import { NextResponse } from "next/server";
import { bad, forbidden, notFound, requireAdmin, requirePermission } from "@/lib/api-auth";
import { activeCases, evalSetFor } from "@/lib/un/evalset";
import { alignment, runEvalSet } from "@/lib/un/eval-run";
import { isUuid } from "@/lib/un/model";
import { loadUseCase } from "@/lib/un/sijil-store";
import { SUBJECT_RULES, type SubjectRule } from "@/lib/un/subject";
import { appendEntry, approvalState, configOf, designationOf, verifyChain } from "@/lib/un/tuning";
import { loadLog } from "@/lib/un/tuning-store";
import { appendWindow, canReinstate, replay, runWindow, type WatchEntry } from "@/lib/un/watchdog";
import { appendWatch, loadWatch, resetWatch } from "@/lib/un/watchdog-store";

type Ctx = { params: Promise<{ id: string }> };

/** POST { action } → the production watchdog, SIMULATED (the serving agent, its drift and Sijil are simulated).
 *   deploy                      put the approved agent version into production; links to the tuning log head
 *   window  { drift? }          run the same evals once; drift drops one rule to simulate a regression
 *   reinstate { comment }       roll back to the certified version, re-test it, and let a person bring it back on probation
 * Each action has its own permission (deploy, watchdog.window, reinstate; see authz.ts); a legacy admin has all three. */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const who = await requirePermission(["deploy", "watchdog.window", "reinstate"], { useCaseId: id });
  if (who instanceof NextResponse) return who;
  const b = (await request.json().catch(() => ({}))) as { action?: unknown; drift?: unknown; comment?: unknown };
  // permission first, before any state is looked at: an unauthorised caller gets a refusal, not a state error
  const act = b.action;
  const may = act === "deploy" ? who.decide("deploy") : act === "window" ? who.decide("watchdog.window") : act === "reinstate" ? who.decide("reinstate") : null;
  if (may && !may.ok) return forbidden(may.reason);
  const uc = await loadUseCase(who.org_id!, id);
  if (!uc) return notFound();
  const all = evalSetFor(uc.ext_id);
  if (!all.length) return bad(`No eval set for ${uc.ext_id} yet`);

  const [tuning, watch] = await Promise.all([loadLog(who.org_id!, id), loadWatch(who.org_id!, id)]);
  const v = verifyChain(watch);
  if (!v.ok) return NextResponse.json({ error: `The production log failed verification at entry ${v.broken_seq}: ${v.reason}` }, { status: 409 });
  const state = replay(watch);
  const signer = who.email ?? who.id;
  const certified = configOf(tuning);
  const now = () => new Date().toISOString();

  if (b.action === "deploy") {
    if (approvalState(tuning) !== "approved" || !certified) return NextResponse.json({ error: "Only an approved agent version can go into production." }, { status: 409 });
    if (state.deployed) return NextResponse.json({ error: "Already in production. Reset to start again." }, { status: 409 });
    // the pilot must still be met: a test set, thresholds or targets changed since the approval make the old pilot stale
    const release = await loadRelease(who.org_id!, id);
    if (!release.ok) return NextResponse.json({ error: `Going into production needs a met pilot. Not ready: ${release.blockers.slice(0, 6).map((x) => x.message).join(" ")}${release.blockers.length > 6 ? ` (and ${release.blockers.length - 6} more)` : ""}`, blockers: release.blockers }, { status: 409 });
    const entry = appendEntry<WatchEntry["kind"]>(null, "deployed", signer, { version: certified.version, tuning_head_hash: tuning[tuning.length - 1].hash }, now());
    const err = await appendWatch(who.org_id!, id, [entry]);
    if (err) return NextResponse.json({ error: err }, { status: 500 });
    // the stage label says "deployed" only once the agent really is in production
    await createAdminClient().from("un_use_cases").update({ stage: "deployed", updated_at: now() }).eq("id", id).eq("org_id", who.org_id!);
    return NextResponse.json({ ok: true, status: "active" });
  }

  if (!state.deployed || !certified) return NextResponse.json({ error: "The agent is not in production yet." }, { status: 409 });

  if (b.action === "window") {
    if (!state.serving) return NextResponse.json({ error: "The agent is taken down: there is no production traffic to monitor. Reinstate it first." }, { status: 409 });
    let drift: SubjectRule | null = null;
    if (b.drift != null && b.drift !== "") {
      if (typeof b.drift !== "string" || !(b.drift in SUBJECT_RULES) || !certified.rules.includes(b.drift as SubjectRule)) return bad("drift must be one of the agent's rules");
      drift = b.drift as SubjectRule;
    }
    const w = runWindow(certified, all, designationOf(tuning), drift);
    const entries = appendWindow(watch, w, "watchdog (simulated)", now);
    const err = await appendWatch(who.org_id!, id, entries);
    if (err) return NextResponse.json({ error: err }, { status: 500 });
    return NextResponse.json({ clean: w.clean, status: replay([...watch, ...entries]).status, entries: entries.map((e) => e.kind) });
  }

  if (b.action === "reinstate") {
    const why = canReinstate(state);
    if (why) return NextResponse.json({ error: why }, { status: 409 });
    const comment = typeof b.comment === "string" ? b.comment.trim().slice(0, 1000) : "";
    if (!comment) return bad("Reinstating needs a comment saying what was fixed.");
    const retest = runEvalSet(certified, activeCases(all, designationOf(tuning)));
    const al = alignment(retest.summary);
    if (!al.met) return NextResponse.json({ error: `The rolled-back version failed its re-test: ${al.reasons.join("; ")}` }, { status: 409 });
    const entry = appendEntry<WatchEntry["kind"]>(watch[watch.length - 1], "reinstatement", signer, {
      rolled_back_to: certified.version, signer, comment,
      retest: { n: retest.summary.all.n, correct: retest.summary.all.correct, calls: retest.summary.sijil.calls, rejected: retest.summary.sijil.rejected, run_sha256: retest.sha256 },
    }, now());
    const err = await appendWatch(who.org_id!, id, [entry]);
    return err ? NextResponse.json({ error: err }, { status: 500 }) : NextResponse.json({ ok: true, status: "probation" });
  }

  return bad('action must be "deploy", "window" or "reinstate"');
}

/** DELETE → clear the production log for a fresh demo. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const err = await resetWatch(who.org_id!, id);
  return err ? NextResponse.json({ error: err }, { status: 500 }) : NextResponse.json({ ok: true });
}
