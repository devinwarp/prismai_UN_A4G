import { createHash } from "node:crypto";
import type { GovState } from "./gates.ts";
import type { HitlFacts } from "./hitl.ts";
import { buildReport, type PilotReport, type PilotRun } from "./pilot.ts";
import type { AgentInfo, PilotPlan } from "./pilot-run.ts";
import type { CertifiedData } from "./sop-deployment.ts";
import type { SopPilotCase, SopPilotJob, SopPilotResult } from "./sop-pilot.ts";
import { canon } from "./tuning.ts";
import type { Params } from "./verdict-params.ts";

// The bridge from the SOP pilot to the rest of the lifecycle. The journey's pilot stage, the release gate and the goal judge all read a pilot REPORT built from
// PilotRun records (pilot.ts). The SOP pilot's certify pass produces those records here, so the existing builder, thresholds and recomputation after the goal
// review are used unchanged. Pure: the route saves the report (pilot-store savePilot).
//
// What each measure rests on, so the report can be read honestly:
//   accuracy             the share of runs that met their expectation (an authority test: was blocked before inference, as the pilot already did)
//   hallucination        a run whose citations were not among the passages it was given
//   alignment_controls   no hard failure (valid citations, a person flagged to review where one must)
//   refusal              the authority tests: was the out-of-profile request refused (blocked) as expected
//   consistency          the structured answer of a test agreeing across its repetitions (this is why certify repeats every test)
//   audit_completeness   every run is recorded (always true here)
//   alignment_goals      NOT set here: it comes from the goal judge, after a person approves the judgments
// Tests are the profile's own approved cases, so they are baseline runs (not "generated" runs, which pilot.ts leaves out of the measures).

const digest = (v: unknown) => createHash("sha256").update(canon(v)).digest("hex").slice(0, 32);

const answerOf = (r: SopPilotResult) => {
  const o = (r.output ?? {}) as Record<string, unknown>;
  return digest({ facts: o.facts ?? null, refused: !!o.refused, escalate: !!o.escalate, blocked: r.status === "blocked_by_sijil" });
};

const summaryOf = (r: SopPilotResult) => {
  const o = (r.output ?? {}) as Record<string, unknown>;
  const text = typeof o.answer === "string" ? o.answer : typeof o.refused === "string" ? `Refused: ${o.refused}` : typeof o.escalate === "string" ? `Escalated: ${o.escalate}` : "";
  return text.replace(/\s+/g, " ").slice(0, 300);
};

export function toPilotRuns(job: SopPilotJob, results: SopPilotResult[], cases: SopPilotCase[], risk: { client_facing: boolean }, clientFacingTask: (task: string) => boolean): PilotRun[] {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const perRunCost = job.costUsd != null && results.length ? job.costUsd / results.length : null;
  return results.map((r): PilotRun => {
    const test = byId.get(r.id);
    const task = test?.input.task ?? null;
    // an authority test is one whose request asks for work outside the profile (the approved case says so); how it was run is not this module's business
    const authority = !!test && (test.family === "authority" || test.input.requested_task !== test.input.task);
    const clientFacing = risk.client_facing || (task ? clientFacingTask(task) : false);
    return {
      test_id: r.id,
      family: (test?.family ?? "happy_path") as PilotRun["family"],
      task,
      rep: r.rep ?? 1,
      passed: r.passed,
      answer: answerOf(r),
      summary: summaryOf(r),
      latency_ms: r.ms ?? null,
      cost: perRunCost,
      hallucinated: authority ? null : r.failedChecks.includes("citations"),
      controls_ok: authority ? null : !r.hardFailure,
      goals_ok: null,
      refusal_expected: authority,
      refused: authority ? r.passed : null,
      logged: true,
      rejected_calls: 0,
      client_facing: clientFacing,
      compliance_ok: clientFacing ? !r.failedChecks.includes("human_review") : null,
      disclosed: clientFacing ? !!(r.output && "ai_disclosure" in r.output) : null,
      promotion_free: null,
      fee_ok: null,
      differences: r.differences,
      ...(r.status === "blocked_by_sijil" ? { status: "blocked_by_sijil" as const } : {}),
    };
  });
}

export function pilotPlanFor(job: SopPilotJob, cases: SopPilotCase[], certified?: CertifiedData): PilotPlan & { certified?: CertifiedData } {
  const agent: AgentInfo = {
    reasoner: "llm",
    model: job.model,
    ...(job.usage ? { usage: { calls: job.usage.calls, fallbacks: 0, prompt_tokens: job.usage.prompt_tokens, completion_tokens: job.usage.completion_tokens } } : {}),
  };
  return {
    agent,
    // the per-test trace screens belong to the licence-renewal reference agent; an SOP pilot's tests are read in the Pilot panel
    bound: {},
    unexecuted: [],
    aggregate: [`${cases.length} approved tests, each run ${job.reps ?? 1} time(s) with the guidance that scored best`],
    ...(certified ? { certified } : {}),
  };
}

export interface SopReportInput {
  job: SopPilotJob;
  results: SopPilotResult[];
  cases: SopPilotCase[];
  params: Params;
  ext: string;
  facts: HitlFacts;
  gov: GovState;
  risk: { client_facing: boolean };
  clientFacingTask: (task: string) => boolean;
  /** What was certified (the skill and the tuned guidance): kept in the report's plan so the certification can be written when the final report is met. */
  certified?: CertifiedData;
}

export function buildSopPilotReport(i: SopReportInput): { report: PilotReport; runs: PilotRun[]; plan: PilotPlan } {
  const runs = toPilotRuns(i.job, i.results, i.cases, i.risk, i.clientFacingTask);
  const report = buildReport({ runs, params: i.params, test_set_hash: i.job.testHash, ext: i.ext, facts: i.facts, requested: "GO_SUPERVISED", gov: i.gov, reviewerGates: {} });
  return { report, runs, plan: pilotPlanFor(i.job, i.cases, i.certified) };
}
