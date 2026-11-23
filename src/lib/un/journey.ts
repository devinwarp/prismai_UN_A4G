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
}

export interface JourneyStage { id: StageId; n: number; group: (typeof GROUPS)[number]; state: StageState; reason: ReasonCode | null }
export interface Journey { stages: JourneyStage[]; done: number; waiting: number; next: StageId | null }

type R = [StageState, ReasonCode | null];

export function journeyStatus(i: JourneyInput): Journey {
  const sopDone = i.sop.attached && i.sop.ticked > 0 && i.sop.kbOk && i.sop.skills >= i.sop.ticked;
  const sop: R = !i.sop.attached ? ["needs_you", "attach_sop"]
    : i.sop.ticked === 0 ? ["needs_you", "tick_profile"]
    : !i.sop.kbOk ? ["needs_you", "kb_missing"]
    : i.sop.skills < i.sop.ticked ? ["needs_you", "skill_missing"]
    : ["done", null];
  const gates: R = !sopDone ? ["not_yet", "after_sop"] : !i.gates ? ["not_yet", "gates_unbuilt"] : i.gates.accepted ? ["done", null] : ["needs_you", "accept_gates"];
  const verdict: R = i.verdict === null ? ["needs_you", "run_scenario"] : i.verdict === "NO_GO" ? ["stopped", "no_go"] : ["done", null];
  const testsDone = i.tests.ticked > 0 && i.tests.ready >= i.tests.ticked;
  const tests: R = !sopDone ? ["not_yet", "after_sop"] : testsDone ? ["done", null] : ["needs_you", "approve_tests"];
  const pilot: R = !testsDone ? ["not_yet", "tests_first"] : i.pilot.run === 0 ? ["needs_you", "run_pilot"] : i.pilot.met >= i.pilot.ticked ? ["done", null] : ["needs_you", "pilot_not_met"];
  const evals: R = !i.evalSet ? ["not_yet", "no_eval_set"] : i.evalRuns === 0 ? ["needs_you", "run_evals"] : i.evalMet ? ["done", null] : ["needs_you", "evals_not_met"];
  const certified = i.tuning.some((e) => e.kind === "certification" && e.payload.met === true);
  const tuning: R = i.evalRuns === 0 ? ["not_yet", "evals_first"] : certified ? ["done", null] : ["needs_you", "tune_certify"];
  const approvalNow = approvalState(i.tuning);
  const last = i.tuning[i.tuning.length - 1];
  const approval: R = approvalNow === "approved" ? ["done", null]
    : last?.kind === "approval" ? ["stopped", "withheld"]
    : approvalNow === "ready" ? (i.release && !i.release.ready ? ["needs_you", "release_blocked"] : ["needs_you", "sign"])
    : ["not_yet", "needs_certification"];
  const w = replay(i.watch);
  const production: R = !w.deployed ? (approvalNow === "approved" ? ["needs_you", "deploy"] : ["not_yet", "needs_approval"])
    : w.status === "suspended" ? ["stopped", "suspended"]
    : w.status === "warned" ? ["needs_you", "warned"]
    : w.status === "probation" ? ["needs_you", "probation"]
    : ["done", null];
  const rows: Record<StageId, R> = { sop, gates, verdict, tests, pilot, evals, tuning, approval, production };
  const stages = STAGE_IDS.map((id, k): JourneyStage => ({ id, n: k + 1, group: GROUP_OF[id], state: rows[id][0], reason: rows[id][1] }));
  const waiting = stages.filter((s) => s.state === "needs_you" || s.state === "stopped");
  return { stages, done: stages.filter((s) => s.state === "done").length, waiting: waiting.length, next: waiting[0]?.id ?? null };
}
