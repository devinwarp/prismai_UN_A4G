import type { Verdict } from "./model.ts";
import { approvalState, type LogEntry } from "./tuning.ts";
import { replay, type WatchEntry } from "./watchdog.ts";

// The user journey: where a use case is on the road from SOP to production. Pure and derived:
// every call recomputes from the records, nothing is stored, so the bar cannot drift from the data.
// Nine stages in five groups. A state is always shown as text and an icon, never colour alone.
//   done       the stage's records are complete
//   needs_you  a person has something to do here
//   not_yet    earlier work, or something not built yet, comes first
//   stopped    the stage ran and its result blocks the road (NO_GO, withheld approval, suspended agent)

export const STAGE_IDS = ["sop", "gates", "verdict", "tests", "pilot", "evals", "tuning", "approval", "production"] as const;
export type StageId = (typeof STAGE_IDS)[number];
export const GROUP_OF: Record<StageId, "define" | "assess" | "pilot" | "approve" | "run"> = {
  sop: "define", gates: "define", verdict: "assess", tests: "assess", pilot: "pilot", evals: "pilot", tuning: "pilot", approval: "approve", production: "run",
};
export const GROUPS = ["define", "assess", "pilot", "approve", "run"] as const;
export type StageState = "done" | "needs_you" | "not_yet" | "stopped";

/** Short reason a stage is in its state; the UI translates by code. */
export const REASON_EN = {
  attach_sop: "Attach the SOP to this use case.",
  tick_profile: "Tick Automate on at least one job profile.",
  kb_missing: "Build the SOP knowledge base and its vectors for the ticked profiles.",
  skill_missing: "A ticked profile has no skill file yet.",
  after_sop: "Comes after SOP intake.",
  after_previous: "Comes after the stage before it is done.",
  no_verdict_path: "No verdict is possible for this use case yet (verdicts come from staged scenarios). Later work can start; approval still needs this stage.",
  gates_unbuilt: "Per-use-case gates are not available yet.",
  accept_gates: "A person accepts the flags and gates.",
  run_scenario: "Run a scenario and have a person sign the verdict.",
  no_go: "The verdict is NO_GO, so the use case stops here.",
  no_eval_set: "This use case has no eval set yet.",
  run_evals: "Run the pilot evals.",
  evals_not_met: "The latest run does not meet the approval bar.",
  evals_first: "Comes after the pilot evals.",
  tune_certify: "Tune and certify the agent on the held-out cases.",
  needs_certification: "Needs a certification that meets the bar.",
  sign: "Certified: a person decides whether to approve.",
  withheld: "Approval was withheld.",
  needs_approval: "Needs an approved agent version.",
  deploy: "Approved: put the agent into production.",
  suspended: "The agent was taken down.",
  warned: "The agent has a warning.",
  probation: "The agent is on probation.",
  approve_tests: "Approve the test set and the verdict parameters of each ticked profile.",
  tests_first: "Comes after the tests and parameters are approved.",
  run_pilot: "Run the pilot on the real agent.",
  pilot_not_met: "The latest pilot is inconclusive or fails a threshold.",
  pilot_first: "Comes after the pilot is met.",
  sop_tune_certify: "Run the pilot, tune, and certify each ticked job profile on this SOP version.",
  redeploy: "A newer SOP version was approved by the business process owner: certify it and redeploy. The deployed agent still runs the version it was certified on.",
  release_blocked: "Certified, but the pilot is not met yet: see what is missing before it can be signed.",
} as const;
export type ReasonCode = keyof typeof REASON_EN;

export interface JourneyInput {
  sop: { attached: boolean; profiles: number; ticked: number; kbOk: boolean; skills: number };
  /** null: per-use-case gates are not available (stage 2 reads "not yet"). */
  gates: { accepted: boolean } | null;
  verdict: Verdict | null;
  /** Ticked profiles whose test set is approved and unchanged AND whose verdict parameters are approved. */
  tests: { ticked: number; ready: number };
  /** Ticked profiles: how many have a pilot, and how many have a latest pilot that is conclusive with nothing failing. */
  pilot: { ticked: number; run: number; met: number };
  evalSet: boolean;
  evalRuns: number;
  /** Does the latest eval run meet the approval bar? null with no run. */
  evalMet: boolean | null;
  tuning: LogEntry[];
  watch: WatchEntry[];
  /** The release gate's answer (release-gate.ts), when it was worked out: only for a single use case. Absent: not gated here. */
  release?: { ready: boolean; blockers: number };
  /** No staged scenario exists for this use case, so gates can never be accepted and a verdict never signed. Those two stages then say so and do not hold the later work back; approval still needs them. */
  noVerdictPath?: boolean;
  /** The use case is run by the SOP pilot (it has no hand-written eval set): its evals and tuning stages are read from the pilot and its certifications. */
  sopPilot?: boolean;
  /** SOP pilot: how many ticked job profiles have a met certification on the SOP version and skill the use case is on now. */
  certifiedProfiles?: number;
  /** A newer SOP version is attached than the one the deployed agent was certified on. */
  upgrading?: boolean;
}

export interface JourneyStage { id: StageId; n: number; group: (typeof GROUPS)[number]; state: StageState; reason: ReasonCode | null }
export interface Journey { stages: JourneyStage[]; done: number; waiting: number; next: StageId | null }

export type R = [StageState, ReasonCode | null];

/** Each stage on its own records, before the order is enforced (see journeyStatus). */
export function stageRules(i: JourneyInput): Record<StageId, R> {
  const sopDone = i.sop.attached && i.sop.ticked > 0 && i.sop.kbOk && i.sop.skills >= i.sop.ticked;
  const sop: R = !i.sop.attached ? ["needs_you", "attach_sop"]
    : i.sop.ticked === 0 ? ["needs_you", "tick_profile"]
    : !i.sop.kbOk ? ["needs_you", "kb_missing"]
    : i.sop.skills < i.sop.ticked ? ["needs_you", "skill_missing"]
    : ["done", null];
  const gates: R = !sopDone ? ["not_yet", "after_sop"] : i.noVerdictPath ? ["not_yet", "no_verdict_path"] : !i.gates ? ["not_yet", "gates_unbuilt"] : i.gates.accepted ? ["done", null] : ["needs_you", "accept_gates"];
  const verdict: R = i.noVerdictPath ? ["not_yet", "no_verdict_path"] : i.verdict === null ? ["needs_you", "run_scenario"] : i.verdict === "NO_GO" ? ["stopped", "no_go"] : ["done", null];
  const testsDone = i.tests.ticked > 0 && i.tests.ready >= i.tests.ticked;
  const tests: R = !sopDone ? ["not_yet", "after_sop"] : testsDone ? ["done", null] : ["needs_you", "approve_tests"];
  const pilot: R = !testsDone ? ["not_yet", "tests_first"] : i.pilot.run === 0 ? ["needs_you", "run_pilot"] : i.pilot.met >= i.pilot.ticked ? ["done", null] : ["needs_you", "pilot_not_met"];
  const pilotMet = i.pilot.ticked > 0 && i.pilot.met >= i.pilot.ticked;
  const evals: R = i.sopPilot ? (pilotMet ? ["done", null] : ["not_yet", "pilot_first"]) : !i.evalSet ? ["not_yet", "no_eval_set"] : i.evalRuns === 0 ? ["needs_you", "run_evals"] : i.evalMet ? ["done", null] : ["needs_you", "evals_not_met"];
  const certified = i.sopPilot ? i.sop.ticked > 0 && (i.certifiedProfiles ?? 0) >= i.sop.ticked : i.tuning.some((e) => e.kind === "certification" && e.payload.met === true);
  const tuning: R = i.sopPilot ? (!pilotMet ? ["not_yet", "pilot_first"] : certified ? ["done", null] : ["needs_you", "sop_tune_certify"]) : i.evalRuns === 0 ? ["not_yet", "evals_first"] : certified ? ["done", null] : ["needs_you", "tune_certify"];
  // an approval of an older SOP version or skill does not stand: the SOP pilot must be certified again on what the use case is on now
  const approvalNow = i.sopPilot && !certified ? "none" : approvalState(i.tuning);
  const last = i.tuning[i.tuning.length - 1];
  const approval: R = approvalNow === "approved" ? ["done", null]
    : last?.kind === "approval" ? ["stopped", "withheld"]
    : approvalNow === "ready" ? (i.release && !i.release.ready ? ["needs_you", "release_blocked"] : ["needs_you", "sign"])
    : ["not_yet", "needs_certification"];
  const w = replay(i.watch);
  const production: R = w.deployed && i.upgrading ? ["needs_you", "redeploy"] : !w.deployed ? (approvalNow === "approved" ? ["needs_you", "deploy"] : ["not_yet", "needs_approval"])
    : w.status === "suspended" ? ["stopped", "suspended"]
    : w.status === "warned" ? ["needs_you", "warned"]
    : w.status === "probation" ? ["needs_you", "probation"]
    : ["done", null];
  return { sop, gates, verdict, tests, pilot, evals, tuning, approval, production };
}

export function journeyStatus(i: JourneyInput): Journey {
  const rows = stageRules(i);
  // The internal control: the road is walked in order. A stage cannot be done, need someone, or stop the road until the stage before it is done: nothing
  // starts without SOP intake, and records that got ahead of an open stage (older data, a reset, a renamed SOP) do not count until that stage is done again.
  const stages: JourneyStage[] = [];
  const APPROVAL = STAGE_IDS.indexOf("approval");
  STAGE_IDS.forEach((id, k) => {
    // a stage held at "no_verdict_path" does not hold the stages after it back, up to tuning; approval and production still need every earlier stage done
    const open = k > 0 && (k >= APPROVAL ? stages.slice(0, k).some((s) => s.state !== "done") : stages[k - 1].state !== "done" && stages[k - 1].reason !== "no_verdict_path");
    // a deployed agent that is being moved to a newer SOP version keeps showing as deployed work: the older stages restarting must not hide it
    const [state, reason] = open && rows[id][0] !== "not_yet" && !(id === "production" && rows[id][1] === "redeploy") ? (["not_yet", "after_previous"] as R) : rows[id];
    stages.push({ id, n: k + 1, group: GROUP_OF[id], state, reason });
  });
  const waiting = stages.filter((s) => s.state === "needs_you" || s.state === "stopped");
  return { stages, done: stages.filter((s) => s.state === "done").length, waiting: waiting.length, next: waiting[0]?.id ?? null };
}
