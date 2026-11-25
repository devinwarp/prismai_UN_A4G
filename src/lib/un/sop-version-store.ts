import { createAdminClient } from "@/lib/supabase/admin";
import type { JobProfile } from "./sop/profiles";
import { profilesOf, sampleInput } from "./sop/data";
import type { SopChanges, SopVersion } from "./sop/versions";
import type { SopChangeRequest } from "./sop/change";

// SOP versions, the version each use case is attached to, and change requests (supabase/un-entities-admin.sql, not applied yet).
// A shipped sample SOP is its own version 1 (its file); every later version, and every SOP an admin pasted, is a row. Empty tables change nothing:
// the shipped samples keep working exactly as before.

const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);
const ver = (r: Record<string, unknown>): SopVersion => ({
  sop_id: String(r.sop_id), version: Number(r.version), title: String(r.title ?? ""), body: String(r.body ?? ""),
  profiles: Array.isArray(r.profiles) ? (r.profiles as JobProfile[]) : [], changes: (r.changes as SopChanges | null) ?? null,
  created_by: (r.created_by as string | null) ?? null, created_at: iso(r.created_at),
});

/** A shipped sample SOP as its version 1, or null when the id is not a sample. */
export function baseOf(sopId: string): SopVersion | null {
  const input = sampleInput(sopId), profiles = profilesOf(sopId);
  return input && profiles ? { sop_id: sopId, version: 1, title: input.title, body: input.text, profiles, changes: null } : null;
}

export async function loadVersions(orgId: string, sopId: string): Promise<SopVersion[]> {
  const { data } = await createAdminClient().from("un_sop_versions").select("*").eq("org_id", orgId).eq("sop_id", sopId);
  return ((data ?? []) as Record<string, unknown>[]).map(ver).sort((a, b) => a.version - b.version);
}
/** One version of an SOP: a stored one, or the shipped file for version 1 of a sample. */
export async function getVersion(orgId: string, sopId: string, version: number): Promise<SopVersion | null> {
  const stored = (await loadVersions(orgId, sopId).catch(() => [])).find((v) => v.version === version);
  return stored ?? (version === 1 ? baseOf(sopId) : null);
}
/** The newest version of an SOP. */
export async function latestOf(orgId: string, sopId: string): Promise<SopVersion | null> {
  const all = await loadVersions(orgId, sopId).catch(() => []);
  return all.at(-1) ?? baseOf(sopId);
}
/** Stores a new version. Returns an error message, or null. A clash on (SOP, version) means someone else published first. */
export async function saveVersion(orgId: string, v: SopVersion, by: string): Promise<string | null> {
  const { error } = await createAdminClient().from("un_sop_versions").insert({ org_id: orgId, sop_id: v.sop_id, version: v.version, title: v.title, body: v.body, profiles: v.profiles, changes: v.changes, created_by: by, created_at: new Date().toISOString() });
  return error ? (/duplicate|unique/i.test(error.message) ? "Someone published a new version at the same time: reload and try again." : error.message) : null;
}
/** Every SOP id an admin has pasted (the roots that are not shipped samples). */
export async function loadCustomRoots(orgId: string): Promise<string[]> {
  const { data } = await createAdminClient().from("un_sop_versions").select("sop_id").eq("org_id", orgId);
  return [...new Set(((data ?? []) as { sop_id: string }[]).map((r) => r.sop_id))];
}

export interface Attachment { sop_id: string; version: number }
export async function loadAttachment(orgId: string, ucId: string): Promise<Attachment | null> {
  const { data } = await createAdminClient().from("un_use_case_sops").select("sop_id, version").eq("org_id", orgId).eq("use_case_id", ucId).maybeSingle();
  return data ? { sop_id: String((data as Record<string, unknown>).sop_id), version: Number((data as Record<string, unknown>).version ?? 1) || 1 } : null;
}
/** Which use cases are attached to an SOP, and at which version. */
export async function attachmentsOf(orgId: string, sopId: string): Promise<{ use_case_id: string; version: number }[]> {
  const { data } = await createAdminClient().from("un_use_case_sops").select("*").eq("org_id", orgId).eq("sop_id", sopId);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ use_case_id: String(r.use_case_id), version: Number(r.version ?? 1) || 1 }));
}

/** The job profiles a use case works with: those of the version it is attached to (so a deployed use case keeps the profiles it was deployed with). */
export async function profilesForUseCase(orgId: string, ucId: string, sopId: string): Promise<JobProfile[] | null> {
  let version = 1;
  try { version = (await loadAttachment(orgId, ucId))?.version ?? 1; } catch { /* no versions here */ }
  return (await getVersion(orgId, sopId, version).catch(() => null))?.profiles ?? profilesOf(sopId);
}
/** The same for many use cases at once, from the rows the caller already has: (sop, version) to profiles. */
export async function profileIndex(orgId: string): Promise<(sopId: string, version: number) => JobProfile[] | null> {
  const { data } = await createAdminClient().from("un_sop_versions").select("sop_id, version, profiles").eq("org_id", orgId);
  const stored = new Map(((data ?? []) as Record<string, unknown>[]).map((r) => [`${r.sop_id}@${r.version}`, (Array.isArray(r.profiles) ? r.profiles : []) as JobProfile[]]));
  return (sopId, version) => stored.get(`${sopId}@${version}`) ?? (version === 1 ? profilesOf(sopId) : null);
}

/** Automate ticks follow a use case to a new version: a profile that is gone loses its tick, a renamed one keeps it. Returns an error message, or null. */
export async function syncTicks(orgId: string, ucId: string, sopId: string, names: string[], renamed?: { from: string; to: string }): Promise<string | null> {
  const db = createAdminClient();
  if (renamed) { const { error } = await db.from("un_job_profiles").update({ profile: renamed.to }).eq("org_id", orgId).eq("use_case_id", ucId).eq("sop_id", sopId).eq("profile", renamed.from); if (error) return error.message; }
  const { data, error } = await db.from("un_job_profiles").select("profile").eq("org_id", orgId).eq("use_case_id", ucId).eq("sop_id", sopId);
  if (error) return error.message;
  for (const r of (data ?? []) as { profile: string }[]) {
    if (names.includes(r.profile)) continue;
    const { error: e } = await db.from("un_job_profiles").delete().eq("org_id", orgId).eq("use_case_id", ucId).eq("sop_id", sopId).eq("profile", r.profile);
    if (e) return e.message;
  }
  return null;
}

// ---- change requests ----------------------------------------------------------------------------------------------------------
const reqRow = (r: Record<string, unknown>): SopChangeRequest => ({
  id: String(r.id), use_case_id: String(r.use_case_id), sop_id: String(r.sop_id), from_version: Number(r.from_version), to_version: Number(r.to_version),
  requested_by: String(r.requested_by ?? ""), requested_email: (r.requested_email as string | null) ?? null, reason: String(r.reason ?? ""), plan: String(r.plan ?? ""),
  requested_at: iso(r.requested_at ?? r.created_at) ?? new Date(0).toISOString(), status: r.status === "applied" ? "applied" : r.status === "declined" ? "declined" : "open",
  resolved_by: (r.resolved_by as string | null) ?? null, resolved_at: iso(r.resolved_at), note: (r.note as string | null) ?? null, run_id: (r.run_id as string | null) ?? null,
});
export async function loadChangeRequests(orgId: string): Promise<SopChangeRequest[]> {
  const { data } = await createAdminClient().from("un_sop_change_requests").select("*").eq("org_id", orgId);
  return ((data ?? []) as Record<string, unknown>[]).map(reqRow).sort((a, b) => (a.requested_at < b.requested_at ? -1 : 1));
}
export async function insertChangeRequest(orgId: string, r: { use_case_id: string; sop_id: string; from_version: number; to_version: number; requested_by: string; requested_email: string | null; reason: string; plan: string }): Promise<string | null> {
  const { error } = await createAdminClient().from("un_sop_change_requests").insert({ org_id: orgId, ...r, status: "open", requested_at: new Date().toISOString() });
  return error?.message ?? null;
}
export async function resolveChangeRequest(orgId: string, id: string, status: "applied" | "declined", by: string, o: { note?: string | null; run_id?: string | null }): Promise<string | null> {
  const { error } = await createAdminClient().from("un_sop_change_requests").update({ status, resolved_by: by, resolved_at: new Date().toISOString(), note: o.note ?? null, run_id: o.run_id ?? null }).eq("org_id", orgId).eq("id", id);
  return error?.message ?? null;
}
