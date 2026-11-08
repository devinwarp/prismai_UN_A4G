import { createAdminClient } from "@/lib/supabase/admin";
import type { UnUseCaseState } from "./model";
import { attest, buildReport, sha256, simulatedSijil, TARGET_RUNS, type SijilRun } from "./sijil";
import { compliantPatch } from "./guard";
import { liveLabel, liveNode } from "./sijil-live";
import { loadPolicy } from "./store";

export interface FiledReport {
  id: string;
  runs: number;
  pass: boolean;
  content: string;
  sha256: string;
  created_at: string;
}

export async function loadUseCase(orgId: string, id: string): Promise<UnUseCaseState | null> {
  const { data } = await createAdminClient().from("un_use_cases").select("*").eq("org_id", orgId).eq("id", id).maybeSingle();
  return (data as UnUseCaseState | null) ?? null;
}

export async function loadRuns(orgId: string, id: string): Promise<SijilRun[]> {
  const { data } = await createAdminClient().from("un_sijil_runs").select("*").eq("org_id", orgId).eq("use_case_id", id).order("run_no");
  return (data ?? []).map((r) => ({
    run_no: r.run_no, source: r.source, actions: r.actions,
    accuracy: Number(r.accuracy), hallucination_rate: Number(r.hallucination_rate), goal_alignment: Number(r.goal_alignment),
    rejects: r.rejects,
  }));
}

export async function loadReports(orgId: string, id: string): Promise<FiledReport[]> {
  const { data } = await createAdminClient()
    .from("un_pilot_reports").select("id, runs, pass, content, sha256, created_at")
    .eq("org_id", orgId).eq("use_case_id", id).order("created_at", { ascending: false }).limit(20);
  return (data ?? []) as FiledReport[];
}

/** File a report from the runs on record. At TARGET_RUNS or more it also
 * writes the attestation to the use case's compliant flag, which is what the
 * federal dashboard's "compliant %" reads. An interim report (fewer runs)
 * never changes compliance. */
export async function fileReport(orgId: string, uc: UnUseCaseState, runs: SijilRun[]): Promise<{ pass: boolean; applied: boolean }> {
  const admin = createAdminClient();
  const at = new Date().toISOString();
  const policy = await loadPolicy(orgId);
  const content = buildReport({ uc, runs, policyName: policy.name, adapter: liveNode(runs) ? liveLabel(liveNode(runs)!) : simulatedSijil.label, filedAt: at });
  const pass = attest(runs).pass;
  const digest = sha256(content);
  const { data: filed, error } = await admin.from("un_pilot_reports").insert({
    org_id: orgId, use_case_id: uc.id, runs: runs.length, pass, content, sha256: digest, created_at: at,
  }).select("id").single();
  if (error || !filed) throw new Error(error?.message ?? "report not filed");
  const applied = runs.length >= TARGET_RUNS;
  if (applied) await admin.from("un_use_cases").update({ ...compliantPatch({ id: filed.id as string, pass, sha256: digest }), updated_at: at }).eq("id", uc.id).eq("org_id", orgId);
  return { pass, applied };
}
