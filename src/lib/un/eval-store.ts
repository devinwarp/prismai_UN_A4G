import { createAdminClient } from "@/lib/supabase/admin";
import type { CaseResult, EvalRun, EvalSummary } from "./eval-run";

export interface StoredEvalRun {
  id: string;
  use_case_id: string;
  agent_version: number;
  summary: EvalSummary;
  results: CaseResult[];
  sha256: string;
  source: string;
  created_at: string;
}

/** Newest first. Empty if the table is absent (supabase/un-agent-lifecycle.sql not applied). */
export async function loadEvalRuns(orgId: string, useCaseId: string, limit = 20): Promise<StoredEvalRun[]> {
  const { data } = await createAdminClient()
    .from("un_eval_runs")
    .select("*")
    .eq("org_id", orgId)
    .eq("use_case_id", useCaseId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as StoredEvalRun[];
}

export async function saveEvalRun(orgId: string, useCaseId: string, run: EvalRun): Promise<{ id: string } | { error: string }> {
  const { data, error } = await createAdminClient()
    .from("un_eval_runs")
    .insert({ org_id: orgId, use_case_id: useCaseId, agent_version: run.version, summary: run.summary, results: run.results, sha256: run.sha256, source: "simulated" })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "run not saved" };
  return { id: data.id as string };
}
