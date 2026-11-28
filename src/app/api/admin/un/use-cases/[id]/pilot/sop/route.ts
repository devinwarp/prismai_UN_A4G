import { guidanceHash } from "@/lib/un/sop-deployment";
import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import { bad, forbidden, notFound, requirePermission, type Authorised } from "@/lib/api-auth";
import { CHAT_MODEL, chatCompletion, parseLlmJson } from "@/lib/llm";
import { agentLlmEndpoint } from "@/lib/un/agent-llm";
import { addSnapshots, costOf, emptySnapshot, metered } from "@/lib/un/cost";
import { factsOf, loadGov } from "@/lib/un/gates-store";
import { noticeInform } from "@/lib/un/inbox-service";
import { loadJourneyDetails } from "@/lib/un/journey-store";
import { isUuid } from "@/lib/un/model";
import { savePilot } from "@/lib/un/pilot-store";
import { prices } from "@/lib/un/price-store";
import { loadUseCase } from "@/lib/un/sijil-store";
import { loadSop } from "@/lib/un/sop-kb";
import { checkSopKbFor } from "@/lib/un/sop-kb-app";
import {
  approvedSopCases, bestSopRound, condensePrompt, failureSummary, finishBatch, MAX_CERTIFY_REPS, MAX_GUIDANCE_CHARS, MAX_SOP_ROUNDS, roundScore, runSopCase, SOP_BATCH_SIZE, SOP_PILOT_TARGET, tuningPrompt, usableGuidance,
  type SopPilotCase, type SopPilotJob,
} from "@/lib/un/sop-pilot";
import { checkBudget, limitsFromEnv, plannedRunCalls } from "@/lib/un/sop-pilot-budget";
import { pilotOrder } from "@/lib/un/sop-pilot-order";
import { buildSopPilotReport } from "@/lib/un/sop-pilot-report";
import { changeSopPilot, daySpentCalls, listSopPilots, readSopPilot, startSopPilot, type PilotScope } from "@/lib/un/sop-pilot-store";
import { taskPassagesRequired } from "@/lib/un/sop-test-context";
import { loadAttachment } from "@/lib/un/sop-version-store";
import { loadTestLog, requiredFor } from "@/lib/un/test-set-store";
import { inForce, replayTestSet, verifyTest } from "@/lib/un/test-sets";
import { coverage } from "@/lib/un/test-derive";
import { loadParamLog } from "@/lib/un/verdict-param-store";
import { replayParams, verifyParams } from "@/lib/un/verdict-params";
import { skillVersionOf } from "@/lib/un/skill-version-store";
import { EmbedderLoadingError, ensureEmbedder, warmEmbedder } from "@/lib/un/vector";

export const maxDuration = 90;
/** How long one step waits for the embedding model before it answers "busy" (a cold start loads or downloads it). Well inside maxDuration, so the rest of the step still fits. */
const EMBEDDER_WAIT_MS = 25_000;
/** One attempt at one test. A case that gets no answer is tried once more (runSopCase), so two attempts must fit inside maxDuration: 2 x 40 s = 80 s of the 90 s. */
const CASE_TIMEOUT_MS = 40_000;
type Ctx = { params: Promise<{ id: string }> };
const conflict = (error: string) => NextResponse.json({ error }, { status: 409 });
const unavailable = (error: unknown) => NextResponse.json({ error: error instanceof Error ? error.message : "Pilot is unavailable." }, { status: 503 });
const agentModel = () => process.env.AGENT_LLM_MODEL || CHAT_MODEL;
const tuneModel = () => process.env.TUNER_MODEL || CHAT_MODEL;
const LEASE_MS = 100_000;
/** How long one invocation keeps driving a run on the server before it hands over to a fresh one (a hosted function has a time limit; a long-lived server just chains). */
const driveMs = () => Number(process.env.SOP_PILOT_DRIVE_MS) || 60_000;
/** Promise.all, but only after every promise has settled. */
async function settleAll<T>(work: Promise<T>[]): Promise<T[]> {
  await Promise.allSettled(work);
  return Promise.all(work);
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The delivery every action answers with: the run, the limits it runs under, and how many calls the use case has made today. */
async function delivery(scope: PilotScope, job: SopPilotJob | null, extra: Record<string, unknown> = {}) {
  const dayCalls = await daySpentCalls(scope.orgId, scope.useCaseId).catch(() => null);
  const jobs = await listSopPilots(scope, 3).catch(() => (job ? [job] : []));
  return NextResponse.json({ job, jobs: job && !jobs.some((j) => j.id === job.id) ? [job, ...jobs] : jobs, limits: job?.limits ?? limitsFromEnv(), dayCalls, ...extra });
}

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
  // the agent retrieves by vectors and is refused otherwise: the stored knowledge base must be vectorised, current for this version, and the very chunks the tests were written against
  const attached = await loadAttachment(orgId, useCaseId);
  const kb = attached ? await checkSopKbFor(orgId, attached.sop_id, attached.version) : { ok: false, reason: "No SOP is attached." };
  if (!kb.ok) return { error: `The SOP's knowledge base cannot be used by an automated agent: ${kb.reason}` };
  const loaded = loadSop(need.sopId).chunks;
  if (loaded.length !== need.sop.chunks.length || need.sop.chunks.some((c, i) => loaded[i]?.chunk_id !== c.chunk_id || loaded[i]?.chunk_sha256 !== c.chunk_sha256)) {
    return { error: "The knowledge base is not in step with the attached SOP version. Build it again on the SOP page." };
  }
  return { context: need.sop, skill, cases, testHash: set.approved.hash, paramsHash: params.hash, params: params.params, sopId: need.sopId };
}
type Suite = Exclude<Awaited<ReturnType<typeof approved>>, { error: string }>;

const asJob = (row: { job: SopPilotJob }) => row.job;

/** One step of a running Pilot: a batch of tests, or the tuning agent's call. Everything that makes a model call goes through here, whoever drives the run
 * (the browser, the server loop or a chained invocation): the order was checked at the start, the limits are checked before the call, the cost is recorded. */
async function advance(scope: PilotScope, who: Authorised, jobId: string): Promise<{ job: SopPilotJob | null; busy?: boolean; warming?: boolean }> {
  const row = await readSopPilot(scope, jobId);
  if (!row) return { job: null };
  const job = asJob(row);
  if (job.status !== "running") return { job };
  if (row.lease_until && Date.parse(row.lease_until) > Date.now()) return { job, busy: true };
  const save = (r: typeof row, next: SopPilotJob, lease: string | null = null) => changeSopPilot(scope, r, { ...next, updatedAt: new Date().toISOString() }, lease);
  const stop = async (next: SopPilotJob) => ((await save(row, next)) ? { job: next } : { job: asJob((await readSopPilot(scope, jobId)) ?? row) });

  const suite = await approved(scope);
  if (suite.error !== undefined) return stop({ ...job, status: "error", message: suite.error });
  const endpoint = agentLlmEndpoint();
  const screening = endpoint ? "node" : "simulated";
  const model = agentModel();
  const tunerModel = tuneModel();
  if (job.contextHash !== suite.context.hash || job.skillHash !== suite.skill.sha256 || job.testHash !== suite.testHash || job.paramsHash !== suite.paramsHash ||
    job.model !== model || job.tunerModel !== tunerModel || job.screening !== screening) {
    return stop({ ...job, status: "error", message: "The approved SOP, skill, tests, thresholds, or model configuration changed. Start a new run." });
  }

  const tasks = new Map(suite.context.profile.tasks.map((task) => [task.id, task]));
  const round = job.rounds.at(-1)!;
  const reps = job.reps ?? 1;
  // certify runs every test `reps` times, a whole pass at a time, so a partial run still covers every test once
  const list = job.mode === "certify" ? Array.from({ length: reps }, (_, k) => suite.cases.map((test) => ({ test, rep: k + 1 }))).flat() : suite.cases.map((test) => ({ test, rep: 1 }));
  const tunerStep = job.mode === "tune" && roundScore(round, job.caseCount).complete;
  const batch = tunerStep ? [] : list.slice(round.results.length, round.results.length + SOP_BATCH_SIZE);
  const planned = tunerStep ? 1 : batch.length;

  // a batch retrieves by vectors, which is required. The embedding model loads slowly on a cold start (a hosted instance downloads it): wait a bounded time, and if it is
  // still loading say "busy" so the loop or the page asks again, instead of letting the first cold case fail the whole run. A model that cannot load stays an error.
  if (!tunerStep && (await ensureEmbedder(EMBEDDER_WAIT_MS)) === "loading") return { job, busy: true, warming: true };

  // the spend limits are checked before anything is called
  const limits = job.limits ?? limitsFromEnv();
  const spent = await daySpentCalls(scope.orgId, scope.useCaseId);
  const budget = checkBudget({ jobCalls: job.calls ?? 0, dayCalls: spent, planned, limits });
  if (!budget.ok) return stop({ ...job, status: "budget", message: budget.message });

  if (!(await save(row, job, new Date(Date.now() + LEASE_MS).toISOString()))) return { job, busy: true };
  const locked = { ...row, revision: row.revision + 1 };
  let next: SopPilotJob;
  let warming = false;
  // what this step spent, kept even when the step fails: those calls were made (and may be billed), so they count towards the cost and the daily limit
  let spend: Awaited<ReturnType<typeof metered>>["usage"] | undefined;
  const keep = (u: NonNullable<typeof spend>) => { spend = u; };
  const charged = (to: SopPilotJob, used: NonNullable<typeof spend>, callsMade: number): SopPilotJob => {
    const cost = costOf(used, prices());
    return {
      ...to, calls: (job.calls ?? 0) + callsMade,
      usage: { calls: (job.usage?.calls ?? 0) + callsMade, prompt_tokens: (job.usage?.prompt_tokens ?? 0) + used.total.prompt_tokens, completion_tokens: (job.usage?.completion_tokens ?? 0) + used.total.completion_tokens },
      meter: addSnapshots(job.meter ?? emptySnapshot(), used), elapsedMs: (job.elapsedMs ?? 0) + (used.elapsed_ms ?? 0),
      costUsd: job.costUsd === null || cost.usd === null ? null : (job.costUsd ?? 0) + cost.usd,
    };
  };
  try {
    const allowedTasks = new Set(tasks.keys());
    // each task's output contract, read from the SOP's own text for it (the same one the skill states and the tests assert on)
    const contractFor = suite.context.contractFor;
    const humanRelease = (task: { flags: { client_facing: boolean; affects_rights: boolean; irreversible: boolean } }) => !!(suite.context.risk.client_facing || suite.context.risk.affects_rights || suite.context.risk.irreversible ||
      task.flags.client_facing || task.flags.affects_rights || task.flags.irreversible);
    let usage: Awaited<ReturnType<typeof metered>>["usage"];
    if (tunerStep) {
      const reference = [...new Map([...tasks.values()].flatMap((task) => suite.context.chunks.filter((c) => c.chunk_id.endsWith(`#${task.id}`)).map((c) => ({ chunk_id: c.chunk_id, text: c.text.slice(0, 2400) }))).map((passage) => [passage.chunk_id, passage])).values()].slice(0, 24);
      const prompt = tuningPrompt(round, bestSopRound(job) ?? round, tasks, suite.cases, suite.skill.markdown, reference);
      const ask = (p: typeof prompt, k: (u: NonNullable<typeof spend>) => void) => metered(async () => parseLlmJson(await chatCompletion({ system: p.system, messages: [{ role: "user", content: p.user }], timeoutMs: 55_000, json: true, model: tunerModel, maxTokens: 2400 })), k);
      const m = await ask(prompt, keep);
      usage = spend = m.usage;
      let proposed = m.result as { instructions?: unknown; reason?: unknown } | null;
      // guidance that came back over the cap is given back to the tuner to condense, once; nothing is cut for it. Both calls are kept in what the step spent.
      if (typeof proposed?.instructions === "string" && proposed.instructions.trim() && proposed.instructions.length > MAX_GUIDANCE_CHARS) {
        const again = await ask(condensePrompt(proposed.instructions), (u) => keep(addSnapshots(m.usage, u)));
        usage = spend = addSnapshots(usage, again.usage);
        proposed = again.result as typeof proposed;
      }
      const instructions = proposed?.instructions;
      if (!usableGuidance(instructions)) {
        // the tuner could not write usable guidance: the run ends here with the best round so far kept, it does not fail
        next = { ...job, status: "round_limit", message: `The tuning agent could not write guidance within ${MAX_GUIDANCE_CHARS.toLocaleString("en-GB")} characters, so tuning stopped with the best round so far. Certify it, or start another tuning run.` };
      } else {
        const reason = typeof proposed?.reason === "string" && proposed.reason.trim() ? proposed.reason.trim().slice(0, 600) : null;
        next = { ...job, rounds: [...job.rounds, { instructions: instructions.trim(), results: [], tuning: { saw: failureSummary(round, suite.cases, tasks), reason, at: new Date().toISOString() } }] };
      }
    } else {
      // every case settles before a failure is raised, so a call still in flight is metered too
      const m = await metered(() => settleAll(batch.map(async ({ test, rep }) => {
        const task = tasks.get(test.input.task);
        if (!task) throw new Error("The task is no longer assigned");
        // an authority test is blocked before inference (runSopCase) and needs no passages; every other case retrieves by vectors, which is required
        const blocked = !allowedTasks.has(test.input.requested_task) || test.input.requested_task !== test.input.task;
        const passages = blocked ? [] : await taskPassagesRequired(suite.sopId, task, test.input.request);
        return runSopCase(test, { profile: scope.profile, task: task.title, passages, skill: suite.skill.markdown, instructions: round.instructions, allowedTasks, humanRelease: humanRelease(task), contract: contractFor(task.id) },
          ({ system, user }) => chatCompletion({ system, messages: [{ role: "user", content: user }], model, json: true, timeoutMs: CASE_TIMEOUT_MS, maxTokens: 4096, seed: 11, ...(endpoint ?? {}) }), rep);
      })), keep);
      usage = spend = m.usage;
      next = finishBatch({ ...job, rounds: [...job.rounds.slice(0, -1), { ...round, results: [...round.results, ...m.result] }] });
    }
    next = charged(next, usage, usage.total.calls || planned);
    // the certify pass ends by recording a pilot report: what the journey's pilot stage, the release gate and the goal judge read
    if (next.mode === "certify" && next.status === "certified") next = await recordReport(scope, who, next, suite, tasks);
  } catch (error) {
    warming = error instanceof EmbedderLoadingError;
    if (!warming) console.warn("A Pilot step failed.", error instanceof Error ? `${error.name}: ${error.message}` : error);
    // a reason a person can act on, never the raw error of a provider (it can carry request details)
    const reason = !(error instanceof Error) ? null
      : /vector retrieval/i.test(error.message) ? error.message
      : /^Invalid tuning guidance/.test(error.message) ? "The tuning agent's new guidance was empty or longer than 3,000 characters, so it was not used. Start the run again: the tuner works from the best guidance so far."
      : null;
    next = warming ? job : { ...job, status: "error", message: reason ?? "This Pilot step could not complete. Check the configured agent and tuner models before trying again." };
    // calls this step made before it stopped were made (and may be billed): they count towards the cost and the daily limit, whether the step failed or is only waiting for the model
    if (spend?.total.calls) next = charged(next, spend, spend.total.calls);
  }
  if (await save(locked, next)) return warming ? { job: next, busy: true, warming: true } : { job: next };
  return { job: asJob((await readSopPilot(scope, jobId)) ?? row) };
}

async function recordReport(scope: PilotScope, who: Authorised, job: SopPilotJob, suite: Suite, tasks: Map<string, { flags: { client_facing: boolean } }>): Promise<SopPilotJob> {
  const uc = await loadUseCase(scope.orgId, scope.useCaseId);
  if (!uc) return { ...job, status: "error", message: "The use case could not be found to record the pilot report." };
  const built = buildSopPilotReport({
    job, results: job.rounds[0].results, cases: suite.cases as SopPilotCase[], params: suite.params, ext: uc.ext_id, facts: factsOf(uc), gov: await loadGov(scope.orgId),
    risk: { client_facing: suite.context.risk.client_facing }, clientFacingTask: (task) => !!tasks.get(task)?.flags.client_facing,
    // what this report is about, kept in its plan: the certification (skill + tuned guidance) is written once the final report, with the goal review approved, is met
    certified: { profile: scope.profile, sop_id: suite.sopId, sop_version: (await loadAttachment(scope.orgId, scope.useCaseId))?.version ?? 1, skill_sha256: suite.skill.sha256, skill_version: await skillVersionOf(scope.orgId, scope.useCaseId, scope.profile, suite.skill.sha256), skill_markdown: suite.skill.markdown, guidance: (job.rounds[0].instructions ?? "").trim(), test_hash: suite.testHash, params_hash: suite.paramsHash },
  });
  const saved = await savePilot(scope.orgId, scope.useCaseId, { at: new Date().toISOString(), actor: who.email ?? who.id, profile: scope.profile, reps: job.reps ?? 1, runs: built.runs.length, plan: built.plan, report: built.report, run_records: built.runs, basis: null });
  if ("error" in saved) return { ...job, status: "error", message: `The pilot ran but its report could not be saved: ${saved.error}` };
  await noticeInform(scope.orgId, scope.useCaseId, { step: "pilot", kind: "pilot.filed", subject: `A pilot was filed for ${uc.ext_id}`, body: `${scope.profile}: ${built.runs.length} runs, ${built.report.conclusive ? "conclusive" : "not conclusive"}, verdict ${built.report.verdict}.`, link: `/admin/federal/use-cases/${scope.useCaseId}/pilot?profile=${encodeURIComponent(scope.profile)}`, by: who.id, ref: saved.id.slice(0, 8) });
  const guidance = (job.rounds[0].instructions ?? "").trim();
  return { ...job, reportId: saved.id, guidance: { sha256: guidanceHash(guidance), chars: guidance.length }, message: job.exempt ?? null, report: { conclusive: built.report.conclusive, failed: built.report.failed, insufficient: built.report.insufficient, verdict: built.report.verdict } };
}

/** Drive a run on the server until it ends, the time for this invocation is up (then a fresh invocation takes over, with the same session), or a limit stops it. */
async function driveOnServer(scope: PilotScope, who: Authorised, jobId: string, handOver: () => Promise<void>) {
  const t0 = Date.now();
  while (Date.now() - t0 < driveMs()) {
    const r = await advance(scope, who, jobId).catch(() => null);
    if (!r?.job || r.job.status !== "running") return;
    if (r.busy) await sleep(2000);
  }
  await handOver();
}

export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const who = await requirePermission("view", { useCaseId: id });
  if (who instanceof NextResponse) return who;
  const profile = new URL(request.url).searchParams.get("profile")?.trim();
  if (!profile || profile.length > 120) return bad("Select a job profile.");
  const scope = { orgId: who.org_id!, useCaseId: id, profile };
  try { return await delivery(scope, (await readSopPilot(scope))?.job ?? null); }
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
  if (!["start", "step", "stop", "drive"].includes(body?.action)) return bad("Unknown Pilot action.");
  if (body.action === "start" && !["pilot", "tune", "certify"].includes(body.mode)) return bad("Select a Pilot mode.");
  if (body.action !== "start" && (typeof body.job_id !== "string" || !isUuid(body.job_id))) return bad("Select a Pilot run.");
  const scope = { orgId: who.org_id!, useCaseId: id, profile };
  // a server-side driver keeps the run going when the tab is closed; the session of this request is handed on to the next invocation
  const origin = new URL(request.url);
  const cookie = request.headers.get("cookie") ?? "";
  const schedule = (jobId: string) => after(() => driveOnServer(scope, who, jobId, async () => {
    await fetch(`${origin.origin}${origin.pathname}`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ action: "drive", profile, job_id: jobId }) }).catch(() => {});
  }));
  try {
    const row = await readSopPilot(scope, body.action === "start" ? undefined : body.job_id);
    if (body.action !== "start" && !row) return notFound();
    const mode = body.action === "start" ? body.mode : row!.job.mode;
    const permission = who.decide(mode === "tune" ? "tuning.run" : "pilot.run");
    if (!permission.ok) return forbidden(permission.reason);

    if (body.action === "stop") {
      const job = row!.job;
      if (job.status !== "running") return delivery(scope, job);
      const stopped: SopPilotJob = { ...job, status: "stopped", message: "Stopped. Any in-flight batch will finish without scheduling further cases.", updatedAt: new Date().toISOString() };
      return await changeSopPilot(scope, row!, stopped) ? delivery(scope, stopped) : conflict("Run advanced while stopping. Try Stop again.");
    }
    if (body.action === "step") {
      const r = await advance(scope, who, body.job_id);
      return delivery(scope, r.job, r.busy ? { busy: true, ...(r.warming ? { warming: true } : {}) } : {});
    }
    if (body.action === "drive") {
      if (row!.job.status !== "running") return delivery(scope, row!.job);
      if (row!.lease_until && Date.parse(row!.lease_until) > Date.now()) return delivery(scope, row!.job, { busy: true });
      schedule(row!.job.id);
      return delivery(scope, row!.job, { driving: true });
    }

    // start: begin loading the embedding model now (a cold start takes a minute), so the first batch does not wait for all of it
    warmEmbedder();
    if (row?.lease_until && Date.parse(row.lease_until) > Date.now()) return delivery(scope, row.job, { busy: true });
    if (row?.job.status === "running") return conflict("A Pilot is already running for this profile. Resume or stop it first.");
    const suite = await approved(scope);
    if (suite.error !== undefined) return conflict(suite.error);
    const uc = await loadUseCase(scope.orgId, id);
    if (!uc) return notFound();
    // the stage order: SOP done, gates accepted and verdict signed (sop-pilot-order.ts)
    const journey = (await loadJourneyDetails(scope.orgId, [uc]).catch(() => null))?.journeys.get(uc.id) ?? null;
    const order = pilotOrder(journey);
    if (!order.ok) return conflict(order.reason);
    const endpoint = agentLlmEndpoint();
    const screening = endpoint ? "node" : "simulated";
    const model = agentModel();
    const tunerModel = tuneModel();
    const limit = mode === "tune" ? (body.rounds ?? 5) : 1;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SOP_ROUNDS) return bad(`Use one to ${MAX_SOP_ROUNDS} rounds.`);
    const reps = mode === "certify" ? Math.min(MAX_CERTIFY_REPS, Math.max(1, suite.params.min_runs_per_test)) : undefined;
    const limits = limitsFromEnv();
    const need = plannedRunCalls(mode, suite.cases.length, limit, reps);
    if (need > limits.run) return conflict(`This run needs about ${need} model calls (${suite.cases.length} approved tests${mode === "tune" ? `, up to ${limit} rounds` : mode === "certify" ? `, each run ${reps} times` : ""}) and the limit is ${limits.run} per run. Approve fewer tests, use fewer rounds, or raise SOP_PILOT_RUN_CALLS.`);
    const previous = row?.job;
    const reusable = previous && previous.contextHash === suite.context.hash && previous.testHash === suite.testHash && previous.paramsHash === suite.paramsHash && previous.model === model && previous.screening === screening;
    // tune starts from the best guidance found so far; certify runs the best guidance found so far (none: the skill alone)
    const best = reusable && previous.mode !== "certify" ? bestSopRound(previous) : undefined;
    const job: SopPilotJob = {
      id: randomUUID(), status: "running", mode, limit, rounds: [{ instructions: best?.instructions ?? "", results: [] }],
      caseCount: suite.cases.length * (reps ?? 1), contextHash: suite.context.hash, skillHash: suite.skill.sha256, skillVersion: await skillVersionOf(scope.orgId, scope.useCaseId, scope.profile, suite.skill.sha256), testHash: suite.testHash, paramsHash: suite.paramsHash,
      model, tunerModel, screening, target: SOP_PILOT_TARGET, startedAt: new Date().toISOString(), actor: who.email ?? who.id, message: null,
      cases: suite.cases.map((test) => ({ id: test.id, title: test.title, task: test.input.task, family: test.family })), ...(reps ? { reps } : {}),
      calls: 0, limits, updatedAt: new Date().toISOString(), driver: "server",
    };
    if (!(await startSopPilot(scope, job))) return conflict("A Pilot is already running for this profile.");
    schedule(job.id);
    return delivery(scope, job, { driving: true });
  } catch (error) { return unavailable(error); }
}
