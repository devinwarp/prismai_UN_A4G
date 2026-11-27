import { createAdminClient } from "@/lib/supabase/admin";
import { metered, recordToolCalls } from "@/lib/un/cost";
import { loadRelease } from "@/lib/un/release-store";
import { deployedSnapshot, sopCertifications, snapshotOf, snapshotProblems } from "@/lib/un/sop-deployment";
import { loadProfileRows } from "@/lib/un/profiles-store";
import { loadAttachment } from "@/lib/un/sop-version-store";
import { NextResponse } from "next/server";
import { noticeAsk, noticeDone, notifyUseCase } from "@/lib/un/inbox-service";
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

  const [tuning, watch] = await Promise.all([loadLog(who.org_id!, id), loadWatch(who.org_id!, id)]);
  const v = verifyChain(watch);
  if (!v.ok) return NextResponse.json({ error: `The production log failed verification at entry ${v.broken_seq}: ${v.reason}` }, { status: 409 });
  const state = replay(watch);
  const signer = who.email ?? who.id;
  const certified = configOf(tuning);
  const now = () => new Date().toISOString();

  // An SOP-based use case has no hand-written eval set: it goes into production from its pilot. What is deployed is the certified SKILL together with the TUNED
  // GUIDANCE, frozen into one snapshot whose hash is generated here (sop-deployment.ts). The business process owner has already signed the final pilot result (the
  // approval entry of the tuning log); deploying again, for a newer SOP version, needs a new certification and a new approval, and supersedes the snapshot.
  if (!all.length) {
    const deployedSop = deployedSnapshot(watch);
    if (b.action !== "deploy") return bad(deployedSop ? "Monitoring windows and reinstatement are not available for SOP-based agents yet." : `No eval set for ${uc.ext_id} yet`);
    if (!sopCertifications(tuning).size) return bad(`No eval set for ${uc.ext_id} yet, and no job profile has a certified pilot.`);
    if (approvalState(tuning) !== "approved") return NextResponse.json({ error: "Only a pilot result the business process owner has approved can go into production." }, { status: 409 });
    const release = await loadRelease(who.org_id!, id);
    if (!release.ok) return NextResponse.json({ error: `Going into production needs a met pilot. Not ready: ${release.blockers.slice(0, 6).map((x) => x.message).join(" ")}${release.blockers.length > 6 ? ` (and ${release.blockers.length - 6} more)` : ""}`, blockers: release.blockers }, { status: 409 });
    const att = await loadAttachment(who.org_id!, id);
    if (!att) return bad("This use case has no SOP attached.");
    const rows = (await loadProfileRows(who.org_id!, id, att.sop_id)).filter((r) => r.automate);
    const certs = sopCertifications(tuning);
    const { snapshot, sha256 } = snapshotOf(rows.flatMap((r) => (certs.get(r.profile) ? [certs.get(r.profile)!] : [])));
    const problems = snapshotProblems(snapshot, { ticked: rows.map((r) => r.profile), sop_id: att.sop_id, sop_version: att.version, skill_sha256: Object.fromEntries(rows.map((r) => [r.profile, r.skill_sha256])) });
    if (problems.length) return NextResponse.json({ error: `Not deployable as it stands: ${problems.join(" ")}`, problems }, { status: 409 });
    if (state.deployed && !deployedSop) return NextResponse.json({ error: "Already in production. Reset to start again." }, { status: 409 });
    if (deployedSop && deployedSop.sha256 === sha256) return NextResponse.json({ error: "Already in production with exactly this skill and guidance." }, { status: 409 });
    const entry = appendEntry<WatchEntry["kind"]>(watch[watch.length - 1] ?? null, "deployed", signer, { kind: "sop", version: att.version, snapshot_sha256: sha256, snapshot, supersedes: deployedSop?.sha256 ?? null, tuning_head_hash: tuning[tuning.length - 1].hash }, now());
    const err = await appendWatch(who.org_id!, id, [entry]);
    if (err) return NextResponse.json({ error: err }, { status: 500 });
    await createAdminClient().from("un_use_cases").update({ stage: "deployed", updated_at: now() }).eq("id", id).eq("org_id", who.org_id!);
    await notifyUseCase(who.org_id!, id, { step: "deploy", kind: "deploy.done", subject: `${uc.ext_id} ${deployedSop ? "was redeployed on a newer SOP version" : "is in production"}`, body: `${uc.ext_id} (${uc.title}) was ${deployedSop ? "redeployed" : "deployed"} by ${signer}: SOP ${att.sop_id} version ${att.version}, snapshot ${sha256.slice(0, 12)} (skill and tuned guidance together).`, link: `/admin/federal/use-cases/${id}/production`, dedupe: `deploy:${id}:${entry.hash.slice(0, 8)}`, exclude: [who.id], inform: true }).catch(() => {});
    return NextResponse.json({ ok: true, status: "active", snapshot_sha256: sha256, profiles: snapshot.profiles.map((p) => ({ profile: p.profile, skill_sha256: p.skill_sha256, guidance_sha256: p.guidance_sha256 })) });
  }

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
    await notifyUseCase(who.org_id!, id, { step: "deploy", kind: "deploy.done", subject: `${uc.ext_id} is in production`, body: `${uc.ext_id} (${uc.title}) was deployed by ${signer}.`, link: `/admin/federal/use-cases/${id}/production`, dedupe: `deploy:${id}:${entry.hash.slice(0, 8)}`, exclude: [who.id], inform: true }).catch(() => {});
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
    // what the window used is recorded with it: the model calls and tokens, and the tool calls the agent made. (This window is simulated, so it
    // makes no model calls; real production traffic served by the model-driven agent records the same way.)
    const win = await metered(async () => { const r = runWindow(certified, all, designationOf(tuning), drift); recordToolCalls(r.run.summary.sijil.calls); return r; });
    const w = win.result;
    w.payload.usage = win.usage;
    const entries = appendWindow(watch, w, "watchdog (simulated)", now);
    const err = await appendWatch(who.org_id!, id, entries);
    if (err) return NextResponse.json({ error: err }, { status: 500 });
    const after = replay([...watch, ...entries]).status;
    if (after === "warned" || after === "suspended") {
      await noticeAsk(who.org_id!, id, { step: "monitor", key: `watch:${id}`, kind: `monitor.${after}`, decisionKind: after === "suspended" ? "reinstate" : undefined, subject: `${uc.ext_id} is ${after === "suspended" ? "taken down" : "on warning"} in production`,
        body: after === "suspended" ? "A monitoring window failed: the agent was rolled back. A person decides whether to reinstate it, with a comment on what was fixed." : "A monitoring window found a problem. Look at it before the next window.", link: `/admin/federal/use-cases/${id}/production`, by: who.id });
    }
    return NextResponse.json({ clean: w.clean, status: after, entries: entries.map((e) => e.kind) });
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
    if (!err) await noticeDone(who.org_id!, id, { step: "monitor", key: `watch:${id}`, kind: "monitor.reinstated", subject: `${uc.ext_id} was reinstated`, body: `${signer} reinstated the agent on probation. Comment: ${comment}`, link: `/admin/federal/use-cases/${id}/production`, by: who.id, ref: entry.hash.slice(0, 8) });
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
