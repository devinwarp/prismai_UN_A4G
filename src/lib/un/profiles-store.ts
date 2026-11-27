import { createAdminClient } from "@/lib/supabase/admin";
import { ensureSopKb } from "./sop-kb-app";

// Which SOP a use case uses and which of its job profiles are ticked "Automate"
// (supabase/un-profiles.sql). Empty if the tables are absent.

export interface ProfileRow { profile: string; automate: boolean; skill_path: string | null; skill_sha256: string | null }

/** The SOP a use case is on. It also makes that SOP's knowledge base available in this process: every page and route that reads the SOP's chunks
 * (loadSop) learns the SOP id here first, and an uploaded SOP's chunks live in the store, not on disk (sop-kb-live.ts). A failure to load them is
 * not an error here: the checks that need the knowledge base report it. */
export async function loadAttachedSop(orgId: string, ucId: string): Promise<string | null> {
  const { data } = await createAdminClient().from("un_use_case_sops").select("sop_id").eq("org_id", orgId).eq("use_case_id", ucId).maybeSingle();
  const sopId = (data?.sop_id as string | undefined) ?? null;
  if (sopId) await ensureSopKb(orgId, sopId).catch(() => {});
  return sopId;
}

/** Attaches an SOP to a use case at one version (1 for a shipped sample, or the version a use case is moved to). */
export async function attachSop(orgId: string, ucId: string, sopId: string, by: string, version = 1, onlyIfVacant = false): Promise<string | null> {
  const query = createAdminClient()
    .from("un_use_case_sops")
    .upsert({ org_id: orgId, use_case_id: ucId, sop_id: sopId, version, attached_by: by, attached_at: new Date().toISOString() }, { onConflict: "org_id,use_case_id", ignoreDuplicates: onlyIfVacant });
  if (onlyIfVacant) {
    const { data, error } = await query.select("use_case_id");
    return error?.message ?? (data?.length ? null : "An SOP has already been attached. Refresh the dashboard.");
  }
  const { error } = await query;
  return error?.message ?? null;
}

export async function loadProfileRows(orgId: string, ucId: string, sopId: string): Promise<ProfileRow[]> {
  const { data } = await createAdminClient().from("un_job_profiles").select("*").eq("org_id", orgId).eq("use_case_id", ucId).eq("sop_id", sopId);
  return (data ?? []) as ProfileRow[];
}

export async function saveTick(orgId: string, ucId: string, sopId: string, profile: string, automate: boolean, by: string, skill: { path: string; sha256: string } | null): Promise<string | null> {
  const { error } = await createAdminClient()
    .from("un_job_profiles")
    .upsert(
      { org_id: orgId, use_case_id: ucId, sop_id: sopId, profile, automate, skill_path: skill?.path ?? null, skill_sha256: skill?.sha256 ?? null, updated_by: by, updated_at: new Date().toISOString() },
      { onConflict: "org_id,use_case_id,sop_id,profile" },
    );
  return error?.message ?? null;
}
