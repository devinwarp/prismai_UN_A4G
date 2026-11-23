import { NextResponse } from "next/server";
import { bad, notFound, requirePermission } from "@/lib/api-auth";
import { factsOf, loadGov } from "@/lib/un/gates-store";
import { isUuid } from "@/lib/un/model";
import { buildReport } from "@/lib/un/pilot";
import { couldNotRun, executePilot, generatedCases, planPilot, spreadSample, type AgentInfo } from "@/lib/un/pilot-run";
import { makeDrafter } from "@/lib/un/notice-draft";
import { llmReasoner, llmReflector } from "@/lib/un/react-llm";
import { loadPilots, savePilot } from "@/lib/un/pilot-store";
import { loadUseCase } from "@/lib/un/sijil-store";
import { searchSop } from "@/lib/un/sop-kb";
import { ALL_CASES, recordedOcr, runCase, SOP_ID } from "@/lib/un/task-evals";
import { ROLE_OF_PROFILE } from "@/lib/un/testgen";
import { loadTestLog, requiredFor } from "@/lib/un/test-set-store";
import { inForce, replayTestSet, verifyTest } from "@/lib/un/test-sets";
import { loadParamLog } from "@/lib/un/verdict-param-store";
import { replayParams, verifyParams } from "@/lib/un/verdict-params";

/** A pilot and a goal judgment make many calls; allow a long hosted request (seconds). */
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** GET ?profile=<job profile> → the pilot reports of that profile, newest first. Read-only: any signed-in role. */
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const who = await requirePermission("view");
  if (who instanceof NextResponse) return who;
  const profile = text(new URL(request.url).searchParams.get("profile"), 120);
  if (!profile) return bad("profile is required");
  return NextResponse.json({ pilots: await loadPilots(who.org_id!, id, profile) });
}

/** POST { profile } → run the approved tests of the profile on the real agent, under the approved verdict
 * parameters, and store the report. Needs pilot.run. Refused unless the test set is approved and unchanged since,
 * the verdict parameters are approved, and both logs verify. The report is bound to both hashes. Reviewer gates are
 * not recorded yet, so the verdict is the one the measured gates alone allow. */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const who = await requirePermission("pilot.run", { useCaseId: id });
  if (who instanceof NextResponse) return who;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const profile = text(b.profile, 120);
  if (!profile) return bad("profile is required");
  const uc = await loadUseCase(who.org_id!, id);
  if (!uc) return notFound();
  const need = await requiredFor(who.org_id!, id, profile);
  if (!need.ok) return NextResponse.json({ error: need.error }, { status: need.status });
  if (need.sopId !== SOP_ID) return NextResponse.json({ error: `The real agent has executable cases only for ${SOP_ID}` }, { status: 409 });

  // the authority probes bind to the profile's own agent role; a profile with no role is refused, never run as dv
  if (!Object.hasOwn(ROLE_OF_PROFILE, profile)) return NextResponse.json({ error: `No agent role is defined for the job profile "${profile}", so its pilot cannot be run` }, { status: 422 });
  const role = ROLE_OF_PROFILE[profile];

  const tlog = await loadTestLog(who.org_id!, id, profile);
  if (!verifyTest(tlog).ok) return NextResponse.json({ error: "The test-set log failed verification" }, { status: 409 });
  const tset = replayTestSet(tlog);
  if (!inForce(tset)) return NextResponse.json({ error: "Approve the test set first (and approve again after any change): the pilot runs only an approved, unchanged set" }, { status: 409 });
  const plog = await loadParamLog(who.org_id!, id, profile);
  if (!verifyParams(plog).ok) return NextResponse.json({ error: "The verdict-parameter log failed verification" }, { status: 409 });
  const pstate = replayParams(plog);
  if (!pstate.approved) return NextResponse.json({ error: "Approve the verdict parameters first: the pilot is judged only against approved thresholds" }, { status: 409 });

  const params_ = pstate.approved.params;
  // agent: "llm" lets a language model choose the searches of the agent's ReAct loop (AGENT_LLM_MODEL); the default is the
  // code-based reasoner. A sample ({ sample: n tests, reps }) runs fewer tests or repetitions to measure cost and time first:
  // it is recorded as a sample and is never conclusive.
  const useLlm = b.agent === "llm";
  if (useLlm && !(process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY)) return NextResponse.json({ error: "No model is configured for the agent (set LLM_API_KEY)" }, { status: 409 });
  const llm = useLlm ? llmReasoner() : null;
  // with a model, the same model also writes the T12 fee-notice messages (a draft for an officer), and the T12 client-facing
  // scenarios run on those messages; without one there is no message, so those scenarios stay unexecuted
  const drafter = useLlm ? makeDrafter() : null;
  // and a second look at every ReAct answer: the model must quote the sentence that states it, and the program checks the quote
  const reflector = useLlm ? llmReflector() : null;
  const env = { retrieve: async (q: string, kind?: string) => (await searchSop(SOP_ID, q, { k: 5, kind })).hits, ocr: recordedOcr(), ...(llm ? { reasoner: llm.reasoner } : {}), ...(drafter ? { drafter: drafter.draft } : {}), ...(reflector ? { reflect: reflector.reflect } : {}) };
  const cases = [...ALL_CASES, ...generatedCases(tset.blueprints, ALL_CASES, role, !!drafter)];
  const wantReps = Number.isInteger(b.reps) && (b.reps as number) >= 1 ? Math.min(b.reps as number, params_.min_runs_per_test) : params_.min_runs_per_test;
  const bound = Object.keys(planPilot(tset.blueprints, cases, role).bound);
  const wantTests = Number.isInteger(b.sample) && (b.sample as number) >= 1 ? (b.sample as number) : null;
  const only = wantTests ? new Set(spreadSample(bound, wantTests)) : undefined;
  // an accepted generated case that cannot run is recorded as disputed, with the reason; it must not end the pilot
  const generatedIds = new Set(tset.blueprints.filter((x) => x.gen).map((x) => x.id));
  const run = async (c: Parameters<typeof runCase>[0]) => { try { return await runCase(c, env); } catch (e) { if (generatedIds.has(c.id)) return couldNotRun(c, e); throw e; } };
  const { runs, plan } = await executePilot(tset.blueprints, cases, run, wantReps, Date.now, role, only);
  const agent: AgentInfo = { reasoner: llm ? "llm" : "rule", ...(llm ? { model: llm.model, usage: { calls: llm.usage.calls, fallbacks: llm.usage.fallbacks, prompt_tokens: llm.usage.prompt_tokens, completion_tokens: llm.usage.completion_tokens } } : {}), ...(drafter ? { drafter: { model: drafter.model, ...drafter.usage } } : {}), ...(reflector ? { reflection: { model: reflector.model, ...reflector.usage } } : {}), ...(only || wantReps < params_.min_runs_per_test ? { sample: { tests: only ? only.size : bound.length, of: bound.length, reps: wantReps } } : {}) };
  plan.agent = agent;
  const report = buildReport({
    runs, params: params_, test_set_hash: tset.approved!.hash, ext: uc.ext_id, facts: factsOf(uc), requested: "GO_SUPERVISED",
    gov: await loadGov(who.org_id!), reviewerGates: {},
  });
  const saved = await savePilot(who.org_id!, id, { at: new Date().toISOString(), actor: who.email ?? who.id, profile, reps: wantReps, runs: runs.length, plan, report, run_records: runs, basis: null });
  if ("error" in saved) return NextResponse.json({ error: saved.error }, { status: 500 });
  return NextResponse.json({ ok: true, pilot_id: saved.id, agent, runs: runs.length, unexecuted: plan.unexecuted.length, conclusive: report.conclusive, verdict: report.verdict, report_hash: report.report_hash });
}
