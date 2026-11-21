import { createAdminClient } from "@/lib/supabase/admin";

// Which SOP a use case uses and which of its job profiles are ticked "Automate"
// (supabase/un-profiles.sql). Empty if the tables are absent.

export interface ProfileRow { profile: string; automate: boolean; skill_path: string | null; skill_sha256: string | null }

export async function loadAttachedSop(orgId: string, ucId: string): Promise<string | null> {
  const { data } = await createAdminClient().from("un_use_case_sops").select("sop_id").eq("org_id", orgId).eq("use_case_id", ucId).maybeSingle();
  return (data?.sop_id as string | undefined) ?? null;
}

export async function attachSop(orgId: string, ucId: string, sopId: string, by: string): Promise<string | null> {
  const { error } = await createAdminClient()
    .from("un_use_case_sops")
    .upsert({ org_id: orgId, use_case_id: ucId, sop_id: sopId, attached_by: by, attached_at: new Date().toISOString() }, { onConflict: "org_id,use_case_id" });
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
