import type { Journey, ReasonCode, StageId } from "./journey.ts";
import type { BlockerCode, Readiness } from "./release-gate.ts";

// The "next step" of a use case, in one place: what is blocking and where each fix is made. Pure: no I/O.
// Order of truth (docs/superpowers/specs/2026-11-24-use-case-page-redesign-design.md): a stopped stage, then the release gate,
// then a stage waiting for a person, then ready. The gate and the journey are never restated by hand.

export type FixTarget = "sop" | "targets" | "tests" | "pilot";
const ORDER: FixTarget[] = ["sop", "targets", "tests", "pilot"];

/** The page (a route segment under the use case) where a release blocker is fixed. */
export const blockerTarget = (code: BlockerCode): FixTarget =>
  code === "no_profile" ? "sop"
  : code === "no_targets" || code === "target_unmeasurable" ? "targets"
  : code === "stale_set" || code === "stale_params" || code === "params_looser" ? "tests"
  : "pilot";

export interface Signed { verdict: string; by: string | null; at: string | null }
export interface NextStepInput { readiness: Readiness; journey: Journey; signed: Signed | null }
export interface FixGroup { target: FixTarget; count: number }
export type NextStep =
  | { kind: "stopped"; stage: StageId; reason: ReasonCode | null }
  | { kind: "blocked"; total: number; groups: FixGroup[]; more: number; approvedBeforeGate: boolean; messages: string[] }
  | { kind: "waiting"; stage: StageId; reason: ReasonCode | null }
  | { kind: "ready"; signed: Signed | null };

const SHOWN = 3;

export function nextStep({ readiness, journey, signed }: NextStepInput): NextStep {
  const stopped = journey.stages.find((s) => s.state === "stopped");
  if (stopped) return { kind: "stopped", stage: stopped.id, reason: stopped.reason };

  if (!readiness.ok) {
    const counts = new Map<FixTarget, number>();
    for (const b of readiness.blockers) counts.set(blockerTarget(b.code), (counts.get(blockerTarget(b.code)) ?? 0) + 1);
    const groups = [...counts].map(([target, count]) => ({ target, count }))
      .sort((a, b) => b.count - a.count || ORDER.indexOf(a.target) - ORDER.indexOf(b.target))
      .slice(0, SHOWN);
    const total = readiness.blockers.length;
    const approvedBeforeGate = journey.stages.some((s) => (s.id === "approval" || s.id === "production") && s.state === "done");
    return { kind: "blocked", total, groups, more: total - groups.reduce((n, g) => n + g.count, 0), approvedBeforeGate, messages: readiness.blockers.map((b) => b.message) };
  }

  const waiting = journey.stages.find((s) => s.state === "needs_you");
  if (waiting) return { kind: "waiting", stage: waiting.id, reason: waiting.reason };
  return { kind: "ready", signed };
}
