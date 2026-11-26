import { NextResponse } from "next/server";
import { noticeAsk, noticeDone } from "@/lib/un/inbox-service";
import { bad, forbidden, notFound, requirePermission } from "@/lib/api-auth";
import { resolveApprover } from "@/lib/un/approvers";
import { approversForUseCase } from "@/lib/un/approvers-store";
import { factsOf, loadGov } from "@/lib/un/gates-store";
import { appendReview, applyGoals, judgeTests, planReview, replayReviews, testsToJudge, verifyReviews, type Override, type ReviewAction } from "@/lib/un/goal-judge";
import { loadAttachedSop } from "@/lib/un/profiles-store";
import { loadSop } from "@/lib/un/sop-kb";
import { loadTargetLog } from "@/lib/un/target-store";
import { checksOf, replayTargets } from "@/lib/un/targets";
import { isUuid } from "@/lib/un/model";
import { buildReport } from "@/lib/un/pilot";
import { appendReviewLog, loadPilots, loadReviewLog, savePilot } from "@/lib/un/pilot-store";
import { loadUseCase } from "@/lib/un/sijil-store";
import { loadTestLog } from "@/lib/un/test-set-store";
import { replayTestSet } from "@/lib/un/test-sets";
import { loadParamLog } from "@/lib/un/verdict-param-store";
import { paramsHash, replayParams } from "@/lib/un/verdict-params";
import { chatCompletion, CHAT_MODEL } from "@/lib/llm";

/** A pilot and a goal judgment make many calls; allow a long hosted request (seconds). */
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const modelConfigured = () => !!(process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY);
const JUDGE_MODEL = () => process.env.GOAL_JUDGE_MODEL || CHAT_MODEL;

/** GET ?profile=<job profile> → the goal-review state: what the model judged for each pilot, and what a person
 * approved or changed. Read-only: any signed-in role. */
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const who = await requirePermission("view");
  if (who instanceof NextResponse) return who;
  const profile = text(new URL(request.url).searchParams.get("profile"), 120);
  if (!profile) return bad("profile is required");
  const log = await loadReviewLog(who.org_id!, id, profile);
  return NextResponse.json({ state: replayReviews(log), chain: verifyReviews(log), model_configured: modelConfigured(), model: JUDGE_MODEL() });
}

/** POST { profile, pilot_id, action, ... } → goal alignment of a pilot, judged by a model and approved by a person.
 *   judge    { }                                  the model judges each test against the entity's goals (needs pilot.run)
 *   approve  { approver?, overrides?: [{test_id, met, reason}] }   a person approves, with any overrides (needs goals.approve)
 *   withdraw { reason }                           take an approval back (needs goals.approve)
 * Nothing counts until approved. Approving recomputes the report from the stored runs with the judgments in force and
 * stores it as a new report whose basis names this pilot and the approved review. */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const who = await requirePermission(["pilot.run", "goals.approve"], { useCaseId: id });
  if (who instanceof NextResponse) return who;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const act = b.action;
  const may = act === "judge" ? who.decide("pilot.run") : who.decide("goals.approve");
  if (!may.ok) return forbidden(may.reason);
  const profile = text(b.profile, 120);
  const pilotId = text(b.pilot_id, 80);
  if (!profile || !pilotId) return bad("profile and pilot_id are required");
  if (!["judge", "approve", "withdraw"].includes(String(act))) return bad("Unknown action");
  const uc = await loadUseCase(who.org_id!, id);
  if (!uc) return notFound();

  const pilot = (await loadPilots(who.org_id!, id, profile, true)).find((p) => p.id === pilotId);
  if (!pilot) return notFound();
  if (pilot.basis) return bad("Judge the original pilot, not a report recomputed from a review");

  const log = await loadReviewLog(who.org_id!, id, profile);
  const v = verifyReviews(log);
  if (!v.ok) return NextResponse.json({ error: `The goal-review log failed verification at entry ${v.broken_seq}: ${v.reason}` }, { status: 409 });
  const state = replayReviews(log);

  let action: ReviewAction;
  if (act === "judge") {
    // the checks are the process-level acceptance checks of this use case (its approved targets), not the entity's outcome goals
    let tlog;
    try { tlog = await loadTargetLog(who.org_id!, id); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "The target log could not be read" }, { status: 503 }); }
    const goals = checksOf(replayTargets(tlog).approved?.targets ?? []);
    if (!goals.length) return NextResponse.json({ error: "No approved process checks for this use case. Set and approve its process targets, marking the ones to check on every test, before judging." }, { status: 409 });
    if (!modelConfigured()) return NextResponse.json({ error: "No model is configured for the judge (set OPENROUTER_API_KEY or LLM_API_KEY). Goal alignment stays not measured until a model has judged and a person has approved." }, { status: 409 });
    if (state.reviews[pilotId]?.approved) return bad("These judgments are already approved; withdraw the approval before judging again");
    const tset = replayTestSet(await loadTestLog(who.org_id!, id, profile));
    const titles = Object.fromEntries(tset.blueprints.map((x) => [x.id, { title: x.title, expect: x.expect.map((c) => c.text) }]));
    const model = JUDGE_MODEL();
    // the judge is shown the SOP passages each run cited, so it can check a figure against the source instead of guessing
    const sopId = await loadAttachedSop(who.org_id!, id);
    const passages = new Map((sopId ? loadSop(sopId).chunks : []).map((c) => [c.chunk_id, c.text.split("\n").slice(1).join("\n")] as const));
    const judgments = await judgeTests(({ system, user }) => chatCompletion({ system, messages: [{ role: "user", content: user }], maxTokens: 1500, timeoutMs: 60_000, seed: 7, model }), goals, testsToJudge(pilot.run_records, titles, passages));
    action = { type: "judge", pilot_id: pilotId, model, judgments, goals };
  } else if (act === "approve") {
    const a = resolveApprover(b.approver, await approversForUseCase(who.org_id!, id));
    if (!a.ok) return bad(a.error);
    const overrides = Array.isArray(b.overrides) ? (b.overrides as Override[]) : [];
    action = { type: "approve", pilot_id: pilotId, approver: a.approver, overrides: overrides.map((o) => ({ test_id: text(o?.test_id, 200), met: o?.met as boolean, reason: text(o?.reason, 400) })) };
  } else action = { type: "withdraw", pilot_id: pilotId, reason: text(b.reason, 500) };

  const p = planReview(state, action, who.id);
  if (!p.ok) return bad(p.error);
  const entry = appendReview(log[log.length - 1] ?? null, p.kind, who.email ?? who.id, p.payload, new Date().toISOString());
  const err = await appendReviewLog(who.org_id!, id, profile, entry);
  if (err) return NextResponse.json({ error: /duplicate|unique/i.test(err) ? "Someone else changed the review just now; reload and try again" : err }, { status: /duplicate|unique/i.test(err) ? 409 : 500 });

  const gKey = `goals:${id}:${pilotId.slice(0, 8)}`;
  if (p.kind === "judged") await noticeAsk(who.org_id!, id, { step: "pilot", key: gKey, kind: "goals.judged", decisionKind: "goals.approve", subject: `Goal judgments need a decision for ${uc.ext_id}`, body: `The model judged the pilot of ${profile}. A person approves, overrides or withdraws the judgments: it is a decision for a person.`, link: `/admin/federal/use-cases/${id}/pilot`, by: who.id });
  else await noticeDone(who.org_id!, id, { step: "pilot", key: gKey, kind: `goals.${p.kind}`, subject: `Goal judgments ${p.kind} for ${uc.ext_id}`, body: `The goal judgments of ${profile} were ${p.kind}.`, link: `/admin/federal/use-cases/${id}/pilot`, by: who.id, ref: entry.hash.slice(0, 8) });
  if (p.kind !== "approved") {
    const next = replayReviews([...log, entry]).reviews[pilotId];
    return NextResponse.json({ ok: true, kind: p.kind, hash: entry.hash, unjudged: next?.judgments.filter((j) => j.met === null).length ?? 0, not_met: next?.judgments.filter((j) => j.met === false).length ?? 0, judged: next?.judgments.length ?? 0 });
  }

  // Approved: recompute the report from the stored runs with the judgments in force, under the same approved
  // parameters and test set the pilot ran under (refused if either changed since).
  const review = replayReviews([...log, entry]).reviews[pilotId];
  const pstate = replayParams(await loadParamLog(who.org_id!, id, profile));
  const tset = replayTestSet(await loadTestLog(who.org_id!, id, profile));
  if (!pstate.approved || paramsHash(pstate.approved.params) !== pilot.report.params_hash || tset.approved?.hash !== pilot.report.test_set_hash) {
    return NextResponse.json({ ok: true, kind: "approved", hash: entry.hash, recomputed: false, note: "The approved parameters or test set changed since this pilot, so no new report was computed; run the pilot again." });
  }
  const report = buildReport({ runs: applyGoals(pilot.run_records, review), params: pstate.approved.params, test_set_hash: pilot.report.test_set_hash, ext: uc.ext_id, facts: factsOf(uc), requested: "GO_SUPERVISED", gov: await loadGov(who.org_id!), reviewerGates: {} });
  const saved = await savePilot(who.org_id!, id, { at: new Date().toISOString(), actor: who.email ?? who.id, profile, reps: pilot.reps, runs: pilot.runs, plan: pilot.plan, report, run_records: applyGoals(pilot.run_records, review), basis: { pilot_id: pilotId, review_hash: review.approved!.hash } });
  if ("error" in saved) return NextResponse.json({ error: saved.error }, { status: 500 });
  return NextResponse.json({ ok: true, kind: "approved", hash: entry.hash, recomputed: true, report_id: saved.id, verdict: report.verdict, conclusive: report.conclusive, report_hash: report.report_hash });
}
