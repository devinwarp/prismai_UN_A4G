import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { bad, forbidden, notFound, requirePermission } from "@/lib/api-auth";
import { CHAT_MODEL, chatCompletion, parseLlmJson } from "@/lib/llm";
import { agentLlmEndpoint } from "@/lib/un/agent-llm";
import { isUuid } from "@/lib/un/model";
import { approvedSopCases, bestSopRound, finishBatch, MAX_SOP_ROUNDS, roundScore, runSopCase, SOP_BATCH_SIZE, SOP_PILOT_TARGET, tuningPrompt, type SopPilotJob } from "@/lib/un/sop-pilot";
import { changeSopPilot, readSopPilot, startSopPilot, type PilotScope } from "@/lib/un/sop-pilot-store";
import { taskPassages } from "@/lib/un/sop-test-context";
import { loadTestLog, requiredFor } from "@/lib/un/test-set-store";
import { inForce, replayTestSet, verifyTest } from "@/lib/un/test-sets";
import { coverage } from "@/lib/un/test-derive";
import { loadParamLog } from "@/lib/un/verdict-param-store";
import { replayParams, verifyParams } from "@/lib/un/verdict-params";

export const maxDuration = 90;
type Ctx = { params: Promise<{ id: string }> };
const conflict = (error: string) => NextResponse.json({ error }, { status: 409 });
const delivery = (job: SopPilotJob | null) => NextResponse.json({ job });
const unavailable = (error: unknown) => NextResponse.json({ error: error instanceof Error ? error.message : "Pilot is unavailable." }, { status: 503 });
const agentModel = () => process.env.AGENT_LLM_MODEL || CHAT_MODEL;
const tuneModel = () => process.env.TUNER_MODEL || CHAT_MODEL;

async function approved(scope: PilotScope) {
  const { orgId, useCaseId, profile } = scope;
  const need = await requiredFor(orgId, useCaseId, profile);
  if (!need.ok) return { error: need.error };
  if (!need.sop) return { error: "This SOP uses the licence-renewal reference pilot." };
  const skill = need.sop.skill;
  if (!skill) return { error: "Build this job profile's skill before running Pilot." };
  const [log, paramLog] = await Promise.all([loadTestLog(orgId, useCaseId, profile), loadParamLog(orgId, useCaseId, profile)]);
  if (!verifyTest(log).ok || !verifyParams(paramLog).ok) return { error: "The approval logs failed verification." };
  const set = replayTestSet(log);
  if (!inForce(set) || !set.approved) return { error: "Approve the test set on the Tests page first." };
  if (coverage(set.blueprints, need.required).gaps.length) return { error: "The approved set does not cover the current SOP and job profile. Generate and approve tests for the current version." };
  const params = replayParams(paramLog).approved;
  if (!params) return { error: "Approve the verdict parameters on the Tests page first." };
  if (set.blueprints.some((test) => test.status === "active" && test.gen?.input.kind === "sop" && test.gen.input.context_hash !== need.sop!.hash)) {
    return { error: "Retire active generated cases from older SOP versions and approve the updated set before running Pilot." };
  }
  const cases = approvedSopCases(set.blueprints, need.sop.hash);
  if (!cases.length) return { error: "Approve executable Testgen cases for this SOP first." };
  return { context: need.sop, skill, cases, testHash: set.approved.hash, paramsHash: params.hash };
}

export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const who = await requirePermission("view", { useCaseId: id });
  if (who instanceof NextResponse) return who;
  const profile = new URL(request.url).searchParams.get("profile")?.trim();
  if (!profile || profile.length > 120) return bad("Select a job profile.");
  try { return delivery((await readSopPilot({ orgId: who.org_id!, useCaseId: id, profile }))?.job ?? null); }
  catch (error) { return unavailable(error); }
}

export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const who = await requirePermission(["pilot.run", "tuning.run"], { useCaseId: id });
  if (who instanceof NextResponse) return who;
  const body = await request.json().catch(() => null);
  const profile = typeof body?.profile === "string" ? body.profile.trim() : "";
  if (!profile || profile.length > 120) return bad("Select a job profile.");
  if (!["start", "step", "stop"].includes(body?.action)) return bad("Unknown Pilot action.");
  if (body.action === "start" && !["pilot", "tune"].includes(body.mode)) return bad("Select a Pilot mode.");
  if (body.action !== "start" && (typeof body.job_id !== "string" || !isUuid(body.job_id))) return bad("Select a Pilot run.");
  const scope = { orgId: who.org_id!, useCaseId: id, profile };
  try {
    const row = await readSopPilot(scope, body.action === "start" ? undefined : body.job_id);
    if (body.action !== "start" && !row) return notFound();
    const mode = body.action === "start" ? body.mode : row!.job.mode;
    const permission = who.decide(mode === "tune" ? "tuning.run" : "pilot.run");
    if (!permission.ok) return forbidden(permission.reason);
    if (body.action === "stop") {
      const job = row!.job;
      if (job.status !== "running") return delivery(job);
      const stopped: SopPilotJob = { ...job, status: "stopped", message: "Stopped. Any in-flight batch will finish without scheduling further cases." };
      return await changeSopPilot(scope, row!, stopped) ? delivery(stopped) : conflict("Run advanced while stopping. Try Stop again.");
    }
    if (body.action === "step" && row!.job.status !== "running") return delivery(row!.job);
    if (row?.lease_until && Date.parse(row.lease_until) > Date.now()) return NextResponse.json({ job: row.job, busy: true });
    if (body.action === "start" && row?.job.status === "running") return conflict("A Pilot is already running for this profile. Resume or stop it first.");

    const suite = await approved(scope);
    if (!suite.context || !suite.cases || !suite.skill) {
      if (body.action === "start") return conflict(suite.error);
      const changed: SopPilotJob = { ...row!.job, status: "error", message: suite.error };
      return await changeSopPilot(scope, row!, changed) ? delivery(changed) : conflict("The Pilot changed. Reload and try again.");
    }
    const endpoint = agentLlmEndpoint();
    const screening = endpoint ? "node" : "simulated";
    const model = agentModel();
    const tunerModel = tuneModel();
    if (body.action === "start") {
      const limit = mode === "pilot" ? 1 : body.rounds ?? 5;
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SOP_ROUNDS) return bad(`Use one to ${MAX_SOP_ROUNDS} rounds.`);
      const previous = row?.job;
      const reusable = previous && previous.contextHash === suite.context.hash && previous.testHash === suite.testHash &&
        previous.paramsHash === suite.paramsHash && previous.model === model && previous.screening === screening;
      const best = mode === "tune" && reusable ? bestSopRound(previous) : undefined;
      const job: SopPilotJob = {
        id: randomUUID(), status: "running", mode, limit, rounds: [{ instructions: best?.instructions ?? "", results: [] }],
        caseCount: suite.cases.length, contextHash: suite.context.hash, skillHash: suite.skill.sha256, testHash: suite.testHash, paramsHash: suite.paramsHash,
        model, tunerModel, screening, target: SOP_PILOT_TARGET, startedAt: new Date().toISOString(), actor: who.email ?? who.id, message: null,
      };
      return await startSopPilot(scope, job) ? delivery(job) : conflict("A Pilot is already running for this profile.");
    }

    const job = row!.job;
    if (job.contextHash !== suite.context.hash || job.skillHash !== suite.skill.sha256 || job.testHash !== suite.testHash || job.paramsHash !== suite.paramsHash ||
      job.model !== model || job.tunerModel !== tunerModel || job.screening !== screening) {
      const changed: SopPilotJob = { ...job, status: "error", message: "The approved SOP, skill, tests, thresholds, or model configuration changed. Start a new run." };
      return await changeSopPilot(scope, row!, changed) ? delivery(changed) : conflict("The Pilot changed. Reload and try again.");
    }
    if (!(await changeSopPilot(scope, row!, job, new Date(Date.now() + 100_000).toISOString()))) return NextResponse.json({ job, busy: true });
    const locked = { ...row!, revision: row!.revision + 1 };
    let next: SopPilotJob;
    try {
      const tasks = new Map(suite.context.profile.tasks.map((task) => [task.id, task]));
      const round = job.rounds.at(-1)!;
      if (roundScore(round, job.caseCount).complete) {
        const reference = [...new Map([...tasks.values()].flatMap((task) => taskPassages(suite.context.chunks, task).slice(0, 3)).map((passage) => [passage.chunk_id, passage])).values()].slice(0, 24);
        const prompt = tuningPrompt(round, bestSopRound(job) ?? round, tasks, suite.cases, suite.skill.markdown, reference);
        const proposed = parseLlmJson(await chatCompletion({ system: prompt.system, messages: [{ role: "user", content: prompt.user }], timeoutMs: 55_000, json: true, model: tunerModel, maxTokens: 2400 }));
        const instructions = (proposed as { instructions?: unknown } | null)?.instructions;
        if (typeof instructions !== "string" || !instructions.trim() || instructions.length > 3000) throw new Error("Invalid tuning guidance");
        next = { ...job, rounds: [...job.rounds, { instructions: instructions.trim(), results: [] }] };
      } else {
        const batch = suite.cases.slice(round.results.length, round.results.length + SOP_BATCH_SIZE);
        const allowedTasks = new Set(tasks.keys());
        const results = await Promise.all(batch.map((test) => {
          const task = tasks.get(test.input.task);
          if (!task) throw new Error("The task is no longer assigned");
          return runSopCase(test, {
            profile, task: task.title, passages: taskPassages(suite.context.chunks, task, test.input.request), skill: suite.skill.markdown, instructions: round.instructions,
            allowedTasks, humanRelease: !!(suite.context.risk.client_facing || suite.context.risk.affects_rights || suite.context.risk.irreversible ||
              task.flags.client_facing || task.flags.affects_rights || task.flags.irreversible),
          }, ({ system, user }) => chatCompletion({
            system, messages: [{ role: "user", content: user }], model, json: true,
            timeoutMs: 55_000, maxTokens: 4096, seed: 11, ...(endpoint ?? {}),
          }));
        }));
        next = finishBatch({ ...job, rounds: [...job.rounds.slice(0, -1), { ...round, results: [...round.results, ...results] }] });
      }
    } catch {
      next = { ...job, status: "error", message: "This Pilot step could not complete. Check the configured agent and tuner models before trying again." };
    }
    if (await changeSopPilot(scope, locked, next)) return delivery(next);
    return delivery((await readSopPilot(scope, job.id))?.job ?? null);
  } catch (error) { return unavailable(error); }
}
