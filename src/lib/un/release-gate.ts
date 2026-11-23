import type { Review } from "./goal-judge.ts";
import type { PilotReport } from "./pilot.ts";
import type { Target } from "./targets.ts";
import type { Ruling } from "./testgen.ts";
import type { Params } from "./verdict-params.ts";

// Is a use case ready to be approved and put into production? Pure: no I/O. The records come from release-store.ts.
//
// Approval and go-live need a MET PILOT, for every job profile that is ticked to be automated:
//   1. a pilot exists, run under the test set and the verdict parameters that are approved NOW (a changed set or changed
//      thresholds make the old pilot stale);
//   2. goal alignment was judged and a person approved the judgments (the report recomputed with them is the one that counts);
//   3. the report is conclusive and no threshold fails;
//   4. no generated case is left disputed without a ruling, and none is ruled an agent failure;
// and, for the use case:
//   5. it has approved process targets;
//   6. every pilot-measured target can be proven by the pilot: it has a verdict parameter or a per-test check, never neither
//      (a target that only a live service can show, such as satisfaction, is marked go-live);
//   7. the approved parameters are at least as strict as the targets they feed (a 98% target cannot rest on a 90% threshold);
//   8. every control target (a compliance rule) was checked on the pilot's tests and held on all of them.
// The final report is then signed by a person (the approval step), and the signature records exactly which reports it covers.

export type BlockerCode =
  | "no_profile" | "no_targets" | "no_pilot" | "stale_set" | "stale_params" | "goals_unapproved" | "not_conclusive" | "threshold_failed"
  | "generated_unruled" | "generated_agent_wrong" | "target_unmeasurable" | "params_looser" | "control_unmeasured" | "control_unmet";

export interface Blocker { code: BlockerCode; profile?: string; target?: string; message: string }

export interface ProfileEvidence {
  profile: string;
  /** hash of the test set in force (approved and unchanged), or null */
  set_hash: string | null;
  /** the approved verdict parameters and their hash, or null */
  params: Params | null;
  params_hash: string | null;
  /** the latest report of the profile: the pilot as run, or the one recomputed after the goal judgments were approved */
  report: PilotReport | null;
  /** set on a recomputed report: the pilot whose goal judgments it uses */
  basis_pilot_id: string | null;
  /** the id of the pilot as run (the original), which the rulings and the goal review are keyed to */
  original_pilot_id: string | null;
  review: Review | null;
  rulings: Ruling[];
}

export interface ReleaseInput { profiles: ProfileEvidence[]; /** the approved process targets, or null when none are approved */ targets: Target[] | null }
export interface ReleaseReport { profile: string; report_hash: string; test_set_hash: string; params_hash: string; pilot_id: string | null }
export interface Readiness { ok: boolean; blockers: Blocker[]; reports: ReleaseReport[] }

/** The verdict parameters a pilot-measured target may feed, and whether a bigger or a smaller number is stricter. */
const PARAM_DIRECTION: Record<string, "min" | "max"> = {
  accuracy_lower_bound_min: "min", alignment_goals_min: "min", refusal_min: "min", consistency_min: "min", audit_completeness_min: "min", client_facing_compliance_min: "min",
  hallucination_max: "max", latency_p95_ms_max: "max", cost_per_case_max: "max",
};

/** Do the approved parameters ask at least what the target asks? Only a percentage target on a rate parameter is compared (a
 * count target such as "zero unsupported quotes" or a latency in milliseconds has no common unit with its parameter). */
export function paramProblem(t: Target, params: Params | null): string | null {
  if (!t.param_key || t.measured_by !== "pilot" || t.unit !== "percent") return null;
  const dir = PARAM_DIRECTION[t.param_key];
  const have = params ? (params as unknown as Record<string, number | null>)[t.param_key] : null;
  if (dir === undefined || typeof have !== "number") return null;
  const want = t.value / 100;
  if (dir === "min" && t.comparator === "min" && have + 1e-9 < want) return `${t.param_key} is ${have}, looser than the ${want} that target ${t.id} asks`;
  if (dir === "max" && t.comparator === "max" && have - 1e-9 > want) return `${t.param_key} is ${have}, looser than the ${want} that target ${t.id} asks`;
  return null;
}

/** The tests a check was NOT met on, after a person's overrides (an override to "met" clears the whole test). */
export function unmetTests(review: Review, checkId: string): { judged: number; unmet: string[] } {
  const over = new Map((review.approved?.overrides ?? []).map((o) => [o.test_id, o.met]));
  let judged = 0;
  const unmet: string[] = [];
  for (const j of review.judgments) {
    const g = j.goals.find((x) => x.id === checkId);
    if (!g) continue;
    judged++;
    if (g.met === false && over.get(j.test_id) !== true) unmet.push(j.test_id);
  }
  return { judged, unmet };
}

export function releaseReadiness(i: ReleaseInput): Readiness {
  const blockers: Blocker[] = [];
  const reports: ReleaseReport[] = [];
  const add = (b: Blocker) => blockers.push(b);

  if (!i.profiles.length) add({ code: "no_profile", message: "No job profile is ticked to be automated, so there is nothing to release." });
  if (!i.targets || !i.targets.length) add({ code: "no_targets", message: "The use case has no approved process targets: say what it commits to deliver and how that is measured." });

  for (const p of i.profiles) {
    const at = (code: BlockerCode, message: string) => add({ code, profile: p.profile, message: `${p.profile}: ${message}` });
    const r = p.report;
    if (!r) { at("no_pilot", "no pilot has been run."); continue; }
    if (!p.set_hash || r.test_set_hash !== p.set_hash) at("stale_set", "the pilot ran under a test set that is not the approved one now: approve the set and run the pilot again.");
    if (!p.params_hash || r.params_hash !== p.params_hash) at("stale_params", "the pilot ran under verdict parameters that are not the approved ones now: run the pilot again.");
    if (!p.basis_pilot_id || !p.review?.approved) at("goals_unapproved", "the goal judgments are not approved: judge the pilot and have a person approve the judgments, so goal alignment is measured.");
    if (!r.conclusive) at("not_conclusive", `the pilot is not conclusive${r.insufficient.length ? ` (${r.insufficient.slice(0, 3).join("; ")})` : ""}.`);
    if (r.failed.length) at("threshold_failed", `a threshold fails: ${r.failed.join(", ")}.`);
    const disputed = (r.generated?.cases ?? []).filter((c) => c.disputed_reps > 0);
    for (const c of disputed) {
      const ruled = p.rulings.find((x) => x.case_id === c.case_id && x.pilot_id === p.original_pilot_id);
      if (!ruled) at("generated_unruled", `generated case ${c.case_id} was disputed and has no ruling.`);
      else if (ruled.ruling === "agent_wrong") at("generated_agent_wrong", `generated case ${c.case_id} was ruled an agent failure.`);
    }
    reports.push({ profile: p.profile, report_hash: r.report_hash, test_set_hash: r.test_set_hash, params_hash: r.params_hash, pilot_id: p.original_pilot_id });
  }

  for (const t of i.targets ?? []) {
    if (t.measured_by !== "pilot") continue;
    if (!t.param_key && !t.check) add({ code: "target_unmeasurable", target: t.id, message: `Target ${t.id} ("${t.statement}") is pilot-measured but feeds no verdict parameter and has no per-test check, so the pilot cannot prove it: link it to a parameter, or mark it go-live.` });
    for (const p of i.profiles) {
      const why = paramProblem(t, p.params);
      if (why) add({ code: "params_looser", profile: p.profile, target: t.id, message: `${p.profile}: ${why}.` });
      if (t.check) {
        if (!p.review?.approved) continue; // already reported as goals_unapproved
        const { judged, unmet } = unmetTests(p.review, t.id);
        if (judged === 0) add({ code: "control_unmeasured", profile: p.profile, target: t.id, message: `${p.profile}: control ${t.id} ("${t.statement}") was asked of no test in the pilot, so it is not proven.` });
        else if (unmet.length) add({ code: "control_unmet", profile: p.profile, target: t.id, message: `${p.profile}: control ${t.id} ("${t.statement}") was not met on ${unmet.length} of ${judged} tests (${unmet.slice(0, 3).join(", ")}${unmet.length > 3 ? ", ..." : ""}).` });
      }
    }
  }
  return { ok: blockers.length === 0, blockers, reports };
}
