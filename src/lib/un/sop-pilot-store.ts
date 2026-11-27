import { createAdminClient } from "@/lib/supabase/admin";
import type { SopPilotJob } from "./sop-pilot";

export interface PilotScope { orgId: string; useCaseId: string; profile: string }
interface JobRow { id: string; job: SopPilotJob; revision: number; lease_until: string | null }

const table = ({ orgId, useCaseId, profile }: PilotScope) => createAdminClient().from("un_sop_pilot_jobs").select("id,job,revision,lease_until")
  .eq("org_id", orgId).eq("use_case_id", useCaseId).eq("profile", profile);

function storeError(error: { message: string }) {
  return new Error(/un_sop_pilot_jobs|schema cache/i.test(error.message)
    ? "The Pilot database migration is missing. Apply supabase/un-sop-pilot.sql."
    : "The Pilot run could not be read or saved.");
}

export async function readSopPilot(scope: PilotScope, id?: string): Promise<JobRow | null> {
  const query = table(scope);
  const { data, error } = await (id ? query.eq("id", id) : query.order("started_at", { ascending: false }).limit(1)).maybeSingle();
  if (error) throw storeError(error);
  return data as JobRow | null;
}

export async function startSopPilot(scope: PilotScope, job: SopPilotJob) {
  const { data, error } = await createAdminClient().from("un_sop_pilot_jobs").upsert({
    id: job.id, org_id: scope.orgId, use_case_id: scope.useCaseId, profile: scope.profile,
    active_slot: scope.profile, revision: 0, lease_until: null, started_at: job.startedAt, job,
  }, { onConflict: "org_id,use_case_id,active_slot", ignoreDuplicates: true }).select("id").maybeSingle();
  if (error) throw storeError(error);
  return !!data;
}

export async function changeSopPilot(scope: PilotScope, row: JobRow, job: SopPilotJob, lease: string | null = null) {
  const { data, error } = await createAdminClient().from("un_sop_pilot_jobs")
    .update({ job, active_slot: job.status === "running" ? scope.profile : null, revision: row.revision + 1, lease_until: lease })
    .eq("org_id", scope.orgId).eq("use_case_id", scope.useCaseId).eq("profile", scope.profile)
    .eq("id", row.id).eq("revision", row.revision).select("id").maybeSingle();
  if (error) throw storeError(error);
  return !!data;
}
