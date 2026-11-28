import { createAdminClient } from "@/lib/supabase/admin";
import { replaySkillVersions, versionOfHash, type SkillVersionEntry } from "./skill-versions";

// The skill-version log of one use case and job profile (supabase/un-output-contract.sql, not applied yet). Append-only, hash-chained, oldest first.

const missing = (m: string) => (/un_skill_version_log|schema cache/i.test(m) ? "The skill version migration is missing. Apply supabase/un-output-contract.sql." : m);

export async function loadSkillVersionLog(orgId: string, useCaseId: string, profile: string): Promise<SkillVersionEntry[]> {
  const { data, error } = await createAdminClient().from("un_skill_version_log").select("*").eq("org_id", orgId).eq("use_case_id", useCaseId).eq("profile", profile);
  if (error) throw new Error(missing(error.message));
  return ((data ?? []) as Record<string, unknown>[])
    .map((r) => ({ seq: Number(r.seq), kind: r.kind, at: new Date(String(r.at)).toISOString(), actor: String(r.actor), payload: r.payload, prev_hash: String(r.prev_hash), hash: String(r.hash) }) as SkillVersionEntry)
    .sort((a, b) => a.seq - b.seq);
}

/** Returns an error message, or null. A clash on (use case, profile, seq) means someone else wrote first. */
export async function appendSkillVersionLog(orgId: string, useCaseId: string, profile: string, e: SkillVersionEntry): Promise<string | null> {
  const { error } = await createAdminClient().from("un_skill_version_log")
    .insert({ org_id: orgId, use_case_id: useCaseId, profile, seq: e.seq, kind: e.kind, at: e.at, actor: e.actor, payload: e.payload, prev_hash: e.prev_hash, hash: e.hash });
  return error ? (/duplicate|unique/i.test(error.message) ? "Someone else built this skill just now: reload and try again." : missing(error.message)) : null;
}

/** The version number a skill (by its hash) is for this profile, or null when none is known (the log is empty, was never written, or its migration is not applied). Never throws. */
export async function skillVersionOf(orgId: string, useCaseId: string, profile: string, sha256: string | null | undefined): Promise<number | null> {
  if (!sha256) return null;
  try { return versionOfHash(replaySkillVersions(await loadSkillVersionLog(orgId, useCaseId, profile)), sha256); } catch { return null; }
}
