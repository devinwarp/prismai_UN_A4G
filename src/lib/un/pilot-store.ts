import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PilotPlan } from "./pilot-run";
import type { PilotReport, PilotRun } from "./pilot";
import { appendReview, type ReviewEntry } from "./goal-judge";

export interface StoredPilot {
  id: string;
  at: string;
  actor: string;
  profile: string;
  reps: number;
  runs: number;
  plan: PilotPlan;
  report: PilotReport;
  /** Every run, so the report can be recomputed once goal judgments are approved. */
  run_records: PilotRun[];
  /** Set on a report recomputed after a goal review: the pilot it rests on and the hash of the approved review. */
  basis: { pilot_id: string; review_hash: string } | null;
}

/** The pilot reports of one use case and job profile, newest first. Empty if the table is absent
 * (supabase/un-pilot-reports.sql not applied). */
export async function loadPilots(orgId: string, useCaseId: string, profile: string): Promise<StoredPilot[]> {
  const { data } = await createAdminClient().from("un_lifecycle_pilot_reports").select("*").eq("org_id", orgId).eq("use_case_id", useCaseId).eq("profile", profile);
  return ((data ?? []) as Record<string, unknown>[])
    .map((r) => ({ id: String(r.id), at: new Date(String(r.at)).toISOString(), actor: String(r.actor), profile: String(r.profile), reps: Number(r.reps), runs: Number(r.runs), plan: r.plan, report: r.report, run_records: (r.run_records ?? []) as PilotRun[], basis: (r.basis ?? null) as StoredPilot["basis"] }) as StoredPilot)
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

/** Returns the new id, or an error message. Reports are never updated or deleted. */
export async function savePilot(orgId: string, useCaseId: string, p: Omit<StoredPilot, "id">): Promise<{ id: string } | { error: string }> {
  const id = randomUUID();
  const { error } = await createAdminClient().from("un_lifecycle_pilot_reports").insert({ id, org_id: orgId, use_case_id: useCaseId, profile: p.profile, at: p.at, actor: p.actor, reps: p.reps, runs: p.runs, plan: p.plan, report: p.report, report_hash: p.report.report_hash, run_records: p.run_records, basis: p.basis });
  return error ? { error: error.message } : { id };
}

/** The goal-review log (model judgments, overrides, approvals) of one use case and job profile, oldest first. */
export async function loadReviewLog(orgId: string, useCaseId: string, profile: string): Promise<ReviewEntry[]> {
  const { data } = await createAdminClient().from("un_goal_review_log").select("*").eq("org_id", orgId).eq("use_case_id", useCaseId).eq("profile", profile);
  return ((data ?? []) as Record<string, unknown>[])
    .map((r) => ({ seq: Number(r.seq), kind: r.kind, at: new Date(String(r.at)).toISOString(), actor: String(r.actor), payload: r.payload, prev_hash: String(r.prev_hash), hash: String(r.hash) }) as ReviewEntry)
    .sort((a, b) => a.seq - b.seq);
}

export async function appendReviewLog(orgId: string, useCaseId: string, profile: string, entry: ReviewEntry): Promise<string | null> {
  const { error } = await createAdminClient().from("un_goal_review_log").insert({ org_id: orgId, use_case_id: useCaseId, profile, seq: entry.seq, kind: entry.kind, at: entry.at, actor: entry.actor, payload: entry.payload, prev_hash: entry.prev_hash, hash: entry.hash });
  return error?.message ?? null;
}

export { appendReview };
