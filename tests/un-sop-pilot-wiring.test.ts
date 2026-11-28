import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { journeyStatus, type JourneyInput } from "../src/lib/un/journey.ts";
import { EMPTY_GOV } from "../src/lib/un/gates.ts";
import { DEFAULT_PARAMS } from "../src/lib/un/verdict-params.ts";
import { bestSopRound, condensePrompt, failureSummary, finishBatch, MAX_GUIDANCE_CHARS, roundScore, tuningPrompt, usableGuidance, type SopPilotCase, type SopPilotJob, type SopPilotResult, type SopPilotRound } from "../src/lib/un/sop-pilot.ts";
import { checkBudget, DEFAULT_DAY_CALLS, DEFAULT_RUN_CALLS, limitsFromEnv, plannedRunCalls } from "../src/lib/un/sop-pilot-budget.ts";
import { pilotOrder } from "../src/lib/un/sop-pilot-order.ts";
import { judge, measure } from "../src/lib/un/pilot.ts";
import { buildSopPilotReport, toPilotRuns } from "../src/lib/un/sop-pilot-report.ts";

// The SOP pilot wired into the lifecycle: spend limits, the stage-order check, the journey order, and the pilot report the certify pass records for the journey, the release gate and the goal judge.

// ---- spend limits --------------------------------------------------------------------------------------------------------

test("limits default to 200 calls a run and 600 a day, and the host can set them", () => {
  assert.deepEqual(limitsFromEnv({}), { run: DEFAULT_RUN_CALLS, day: DEFAULT_DAY_CALLS });
  assert.deepEqual(limitsFromEnv({ SOP_PILOT_RUN_CALLS: "50", SOP_PILOT_DAILY_CALLS: "120" }), { run: 50, day: 120 });
  assert.deepEqual(limitsFromEnv({ SOP_PILOT_RUN_CALLS: "-3", SOP_PILOT_DAILY_CALLS: "abc" }), { run: 200, day: 600 }, "a bad value falls back to the default");
});

test("a step that would pass a limit is refused before any call, naming which limit and what to do", () => {
  const limits = { run: 200, day: 600 };
  assert.deepEqual(checkBudget({ jobCalls: 10, dayCalls: 10, planned: 3, limits }), { ok: true });
  assert.deepEqual(checkBudget({ jobCalls: 198, dayCalls: 198, planned: 2, limits }), { ok: true }, "exactly at the limit is allowed");
  const run = checkBudget({ jobCalls: 199, dayCalls: 199, planned: 3, limits });
  assert.equal(run.ok, false);
  if (!run.ok) { assert.equal(run.scope, "run"); assert.match(run.message, /199 of its 200 model calls/); assert.match(run.message, /SOP_PILOT_RUN_CALLS/); }
  const day = checkBudget({ jobCalls: 10, dayCalls: 599, planned: 3, limits });
  assert.equal(day.ok, false);
  if (!day.ok) { assert.equal(day.scope, "day"); assert.match(day.message, /599 of its 600/); assert.match(day.message, /tomorrow/); }
});

test("a whole run is refused at the start when it cannot finish inside its limit", () => {
  assert.equal(plannedRunCalls("pilot", 6, 1), 6);
  assert.equal(plannedRunCalls("tune", 6, 5), 6 + 4 * 7, "the baseline, then per further round one tuning call and every test");
  assert.equal(plannedRunCalls("certify", 6, 1, 3), 18);
  assert.ok(plannedRunCalls("tune", 20, 12) > DEFAULT_RUN_CALLS, "a large profile with many rounds exceeds the default");
});

// ---- the stage-order check -----------------------------------------------------------------------------------------------

const stage = (id: string, state: string) => ({ id, n: 1, group: "define", state, reason: null });
const journey = (states: Record<string, string>) => ({ stages: Object.entries(states).map(([id, state]) => stage(id, state)), done: 0, waiting: 0, next: null }) as never;

test("a pilot needs the SOP stage done, gates accepted and the verdict signed: every use case has a verdict path, so there is no exemption", () => {
  const done = journey({ sop: "done", gates: "done", verdict: "done" });
  assert.deepEqual(pilotOrder(done), { ok: true });
  const sopOpen = pilotOrder(journey({ sop: "needs_you", gates: "not_yet", verdict: "not_yet" }));
  assert.equal(sopOpen.ok, false);
  if (!sopOpen.ok) assert.match(sopOpen.reason, /SOP intake is not complete/);
  const gates = pilotOrder(journey({ sop: "done", gates: "needs_you", verdict: "not_yet" }));
  assert.equal(gates.ok, false);
  if (!gates.ok) assert.match(gates.reason, /Gates are not accepted/);
  const verdict = pilotOrder(journey({ sop: "done", gates: "done", verdict: "needs_you" }));
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.match(verdict.reason, /verdict is not signed/);
  assert.equal(pilotOrder(null).ok, false, "an unreadable journey is refused, not waved through");
});

// ---- the journey order ---------------------------------------------------------------------------------------------------

const sopDone = { attached: true, profiles: 2, ticked: 1, kbOk: true, skills: 1 };
const input = (o: Partial<JourneyInput> = {}): JourneyInput => ({
  sop: sopDone, gates: null, verdict: null, tests: { ticked: 1, ready: 1 }, pilot: { ticked: 1, run: 1, met: 1 }, evalSet: false, evalRuns: 0, evalMet: null, tuning: [], watch: [], ...o,
});
const state = (i: JourneyInput, id: string) => { const s = journeyStatus(i).stages.find((x) => x.id === id)!; return [s.state, s.reason]; };

test("the road is held in order: until the gates are accepted and the verdict signed, tests and the pilot do not count", () => {
  const j = input({ gates: { accepted: false } });
  assert.deepEqual(state(j, "gates"), ["needs_you", "accept_gates"]);
  assert.deepEqual(state(j, "verdict"), ["not_yet", "after_previous"]);
  assert.deepEqual(state(j, "tests"), ["not_yet", "after_previous"]);
  assert.deepEqual(state(j, "pilot"), ["not_yet", "after_previous"]);
});

// ---- the loop helpers ----------------------------------------------------------------------------------------------------

const hash = "a".repeat(64);
const mkCase = (id: string, task: string, family: SopPilotCase["family"] = "happy_path"): SopPilotCase => ({
  id, title: `${task} ${family}`, family, expect: { outcome: "produce", summary: "", assertions: [] },
  input: { kind: "sop", task, requested_task: family === "authority" ? "OUTSIDE_PROFILE" : task, request: "x", context_hash: hash },
}) as SopPilotCase;
const result = (id: string, passed: boolean, over: Partial<SopPilotResult> = {}): SopPilotResult => ({
  id, title: id, requestedTask: "T01", status: passed ? "passed" : "failed", passed, hardFailure: false, differences: passed ? [] : ["diff"], failedChecks: passed ? [] : ["outcome"], citations: [], ...over,
});
const job = (over: Partial<SopPilotJob> = {}): SopPilotJob => ({
  id: "j", status: "running", mode: "tune", limit: 3, rounds: [], caseCount: 2, contextHash: hash, testHash: hash, paramsHash: hash, target: 0.95,
  model: "m", tunerModel: "t", screening: "simulated", actor: "a", startedAt: "now", message: null, ...over,
});

test("the tuning agent is shown the failed check categories per task, never the cases or expected answers, and is asked for its reason", () => {
  const cases = [mkCase("c1", "T01"), mkCase("c2", "T02")];
  const round: SopPilotRound = { instructions: "", results: [result("c1", true), result("c2", false, { failedChecks: ["citations", "outcome"] })] };
  const tasks = new Map([["T01", { title: "Receive the request" }], ["T02", { title: "Score the applications" }]]);
  assert.deepEqual(failureSummary(round, cases, tasks), [{ task: "Score the applications", checks: ["citations", "outcome"] }]);
  const prompt = tuningPrompt(round, round, tasks, cases, "# skill", []);
  assert.match(prompt.system, /"reason"/);
  assert.doesNotMatch(prompt.user, /Receive the request/, "a passing task is not shown");
  assert.doesNotMatch(prompt.user, /"x"/, "the case text stays out");
});

test("a certify run ends when every test has run every repetition, and it has no 'best round'", () => {
  const round: SopPilotRound = { instructions: "g", results: [result("c1", true, { rep: 1 }), result("c2", true, { rep: 1 }), result("c1", true, { rep: 2 }), result("c2", false, { rep: 2 })] };
  const partial = job({ mode: "certify", caseCount: 4, reps: 2, rounds: [{ ...round, results: round.results.slice(0, 3) }] });
  assert.equal(finishBatch(partial).status, "running");
  const done = job({ mode: "certify", caseCount: 4, reps: 2, rounds: [round] });
  assert.equal(finishBatch(done).status, "certified");
  assert.equal(bestSopRound(done), undefined);
  assert.equal(roundScore(round, 4).passed, 3);
});

// ---- the pilot report for the journey, the release gate and the goal judge ------------------------------------------------

const cases = [mkCase("a1", "T01"), mkCase("a2", "T01", "authority"), mkCase("b1", "T02"), mkCase("b2", "T02", "authority")];
const certifyResults = (failAnswer = false): SopPilotResult[] => [1, 2, 3].flatMap((rep) => cases.map((c): SopPilotResult => {
  const authority = c.family === "authority";
  const base = result(c.id, !(failAnswer && c.id === "b1" && rep === 3), { rep, family: c.family, ms: 1200 });
  return authority
    ? { ...base, passed: true, status: "blocked_by_sijil", sijil: { source: "simulated", rules: ["profile_task_authority"] }, output: { status: "blocked_by_sijil" } }
    : { ...base, output: { answer: "A draft", facts: { action: c.id === "b1" && rep === 3 && failAnswer ? "other" : "send" }, ai_disclosure: "AI" } };
}));
const jobFor = (results: SopPilotResult[]) => job({ mode: "certify", caseCount: results.length, reps: 3, rounds: [{ instructions: "", results }], testHash: "f".repeat(64), costUsd: 0.12 });
// the thresholds a person approved for a small SOP profile: few tests per task, repeated three times
const params = { ...DEFAULT_PARAMS, min_tests_per_task: 1, min_runs_per_test: 3, alignment_goals_min: 0.9 };
const reportOf = (results: SopPilotResult[]) => buildSopPilotReport({
  job: jobFor(results), results, cases, params, ext: "UC09", facts: { client_facing: false, affects_rights: false, irreversible: false }, gov: EMPTY_GOV,
  risk: { client_facing: false }, clientFacingTask: () => false,
});

test("the certify results become pilot runs: authority tests refuse, agent tests carry citations, controls and the structured answer for consistency", () => {
  const results = certifyResults();
  const runs = toPilotRuns(jobFor(results), results, cases, { client_facing: false }, () => false);
  assert.equal(runs.length, 12);
  const authority = runs.filter((r) => r.refusal_expected);
  assert.equal(authority.length, 6);
  assert.ok(authority.every((r) => r.refused === true && r.status === "blocked_by_sijil" && r.hallucinated === null && r.controls_ok === null));
  const agent = runs.filter((r) => !r.refusal_expected);
  assert.ok(agent.every((r) => r.hallucinated === false && r.controls_ok === true && r.goals_ok === null && r.latency_ms === 1200 && r.cost !== null));
  const a1 = runs.filter((r) => r.test_id === "a1");
  assert.equal(new Set(a1.map((r) => r.answer)).size, 1, "the same structured answer in every repetition");
  assert.deepEqual(a1.map((r) => r.rep), [1, 2, 3]);
});

test("the report is bound to the approved tests and thresholds, measures consistency across the repetitions, and leaves goal alignment to the goal judge", () => {
  const { report, runs, plan } = reportOf(certifyResults());
  assert.equal(report.test_set_hash, "f".repeat(64));
  assert.equal(runs.length, 12);
  assert.equal(plan.agent?.reasoner, "llm");
  assert.deepEqual(plan.bound, {});
  const f = (name: string) => report.findings.find((x) => x.measure === name)!;
  assert.equal(f("accuracy_lower_bound").value !== null, true);
  assert.equal(f("consistency").value, 1, "every test answered the same way each time");
  assert.equal(f("refusal").value, 1);
  assert.equal(f("alignment_goals").ok, false, "goal alignment is not measured until a person approves the judgments");
  assert.match(f("alignment_goals").note ?? "", /not measured/);
  assert.ok(report.failed.includes("alignment_goals"));
  assert.equal(report.conclusive, true, "with the approved minimums the sample is enough");
  assert.deepEqual(report.insufficient, []);
});

test("a test whose answer changes between repetitions lowers consistency, and a sample below the approved minimum makes the report inconclusive", () => {
  const varied = reportOf(certifyResults(true)).report;
  assert.ok((varied.findings.find((x) => x.measure === "consistency")?.value ?? 1) < 1);
  const results = certifyResults().filter((r) => (r.rep ?? 1) === 1);
  const once = buildSopPilotReport({ job: jobFor(results), results, cases, params: { ...params, min_runs_per_test: 3 }, ext: "UC09", facts: { client_facing: false, affects_rights: false, irreversible: false }, gov: EMPTY_GOV, risk: { client_facing: false }, clientFacingTask: () => false }).report;
  assert.equal(once.conclusive, false);
  assert.match(once.insufficient.join(" "), /ran 1 time/);
});

test("a profile with one test per task is inconclusive under the default minimum of five, and says so", () => {
  const results = certifyResults();
  const strict = buildSopPilotReport({ job: jobFor(results), results, cases, params: DEFAULT_PARAMS, ext: "UC09", facts: { client_facing: false, affects_rights: false, irreversible: false }, gov: EMPTY_GOV, risk: { client_facing: false }, clientFacingTask: () => false }).report;
  assert.equal(strict.conclusive, false);
  assert.match(strict.insufficient.join(" "), /T01 has 1 test; at least 5/);
});

// ---- two measures that could never be met ------------------------------------------------------------------------------

test("consistency is about the outcome a test checks, not the wording of the free-form facts: reworded facts agree, a different outcome does not", () => {
  const wording = (results: SopPilotResult[]) => results.map((r) => r.output && (r.output as { facts?: unknown }).facts ? { ...r, output: { ...r.output, facts: { [`key_${r.rep}`]: `worded differently ${r.rep}` } } } : r);
  const reworded = reportOf(wording(certifyResults())).report;
  assert.equal(reworded.findings.find((x) => x.measure === "consistency")?.value, 1, "same decision, different keys and wording each time: consistent");
  // a different outcome in one repetition: the test passed twice and failed once
  const flaky = reportOf(certifyResults(true)).report;
  assert.ok((flaky.findings.find((x) => x.measure === "consistency")?.value ?? 1) < 1);
  // the same pass, but one repetition escalated and the others did not
  const escalated = certifyResults().map((r) => (r.id === "a1" && r.rep === 2 ? { ...r, output: { ...(r.output as object), escalate: "needs a person" } } : r));
  assert.ok((reportOf(escalated).report.findings.find((x) => x.measure === "consistency")?.value ?? 1) < 1, "escalating in one repetition only is inconsistent");
});

test("client-facing compliance is not applicable to a profile with no client-facing task, but a client-facing profile that gave no result still fails", () => {
  const none = reportOf(certifyResults()).report;
  const f = none.findings.find((x) => x.measure === "client_facing_compliance")!;
  assert.equal(f.ok, null, "not applicable, so not a failure");
  assert.match(f.note ?? "", /not applicable/);
  assert.equal(none.failed.includes("client_facing_compliance"), false);
  // a client-facing profile: its runs are client-facing, and compliance was never measured (nothing set compliance_ok)
  const results = certifyResults();
  const cf = buildSopPilotReport({ job: jobFor(results), results, cases, params, ext: "UC09", facts: { client_facing: true, affects_rights: false, irreversible: false }, gov: EMPTY_GOV, risk: { client_facing: true }, clientFacingTask: () => true });
  const g = cf.report.findings.find((x) => x.measure === "client_facing_compliance")!;
  assert.notEqual(g.ok, null, "a client-facing profile is judged on it");
});

test("a report made before the count of client-facing runs was recorded is judged as before", () => {
  const m = measure(toPilotRuns(jobFor(certifyResults()), certifyResults(), cases, { client_facing: false }, () => false));
  const old = { ...m } as Record<string, unknown>;
  delete old.client_facing_runs;
  const j = judge(old as unknown as typeof m, params);
  assert.equal(j.findings.find((x) => x.measure === "client_facing_compliance")!.ok, false, "no count recorded: a missing measure still fails, as it did");
});

// ---- guidance over the cap ---------------------------------------------------------------------------------------------

test("the tuner's guidance is usable only when it is text, not empty and within the cap; an oversize one is given back to be condensed, never cut", () => {
  assert.equal(MAX_GUIDANCE_CHARS, 3000);
  assert.equal(usableGuidance("Check the grade table first."), true);
  assert.equal(usableGuidance("x".repeat(3000)), true, "exactly at the cap is allowed");
  assert.equal(usableGuidance("x".repeat(3001)), false);
  assert.equal(usableGuidance("   "), false);
  assert.equal(usableGuidance(undefined), false);
  assert.equal(usableGuidance(42), false);
  const long = "Rule one. ".repeat(400);
  const p = condensePrompt(long);
  assert.match(p.system, /Keep every distinct rule/);
  assert.match(p.system, /Do not add anything new/);
  assert.match(p.system, /at most 2800 characters/, "it asks for headroom under the cap");
  const u = JSON.parse(p.user) as { guidance_to_shorten: string; characters_now: number; limit: number };
  assert.equal(u.guidance_to_shorten, long, "the whole guidance goes back, uncut");
  assert.equal(u.characters_now, long.length);
  assert.equal(u.limit, 3000);
});

test("oversize guidance does not fail the run: it is condensed once, and if that still fails tuning ends with the best round kept", () => {
  const route = readFileSync(new URL("../src/app/api/admin/un/use-cases/[id]/pilot/sop/route.ts", import.meta.url), "utf8");
  assert.match(route, /ask\(condensePrompt\(proposed\.instructions\)\)/);
  assert.match(route, /usage = addSnapshots\(usage, again\.usage\)/, "the second call is metered too");
  assert.match(route, /status: "round_limit", message: `The tuning agent could not write guidance within/);
  assert.doesNotMatch(route, /throw new Error\("Invalid tuning guidance"\)/, "no terminal error for guidance that is too long");
});
