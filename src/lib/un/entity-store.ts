import { createAdminClient } from "@/lib/supabase/admin";
import { ENTITY_GOALS, parseGoals } from "./goals";
import type { EntityRow, MemberRow } from "./entity-admin";

// Storage for the entity admin screens: the entity rows (supabase/un-entities-admin.sql adds `hidden`), the federal members (people above any one entity), and job titles.
// Query shapes are the ones the offline stand-in supports (select/eq/insert/upsert/update).

const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);

/** The entity rows of the organisation. An entity that only exists through its use cases or the code seed has no row until an admin first changes it. */
export async function loadEntityRows(orgId: string): Promise<EntityRow[]> {
  const { data } = await createAdminClient().from("un_entities").select("*").eq("org_id", orgId);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ name: String(r.name), sector: (r.sector as string | null) ?? null, goals: parseGoals(r.goals), hidden: r.hidden === true }));
}

/** Every entity name the organisation has: rows, entities of its use cases, and the seeded ones. */
export async function loadKnownEntities(orgId: string): Promise<{ rows: EntityRow[]; known: string[] }> {
  const [rows, ucs] = await Promise.all([loadEntityRows(orgId), createAdminClient().from("un_use_cases").select("entity").eq("org_id", orgId)]);
  const fromUcs = ((ucs.data ?? []) as { entity: string }[]).map((u) => u.entity);
  const known = [...new Set([...rows.map((r) => r.name), ...fromUcs, ...Object.keys(ENTITY_GOALS)])].filter(Boolean).sort();
  return { rows, known };
}

/** The entities an admin has hidden. Empty when the column or table is absent. */
export async function loadHiddenEntities(orgId: string): Promise<Set<string>> {
  try { return new Set((await loadEntityRows(orgId)).filter((r) => r.hidden).map((r) => r.name)); } catch { return new Set(); }
}

/** Creates or updates one entity row, keeping what the caller does not pass. Returns an error message, or null. */
export async function saveEntity(orgId: string, name: string, patch: { sector?: string | null; goals?: unknown; hidden?: boolean }, by: string): Promise<string | null> {
  const prev = (await loadEntityRows(orgId)).find((r) => r.name === name);
  const row = {
    org_id: orgId, name,
    sector: patch.sector !== undefined ? patch.sector : prev?.sector ?? null,
    goals: patch.goals !== undefined ? patch.goals : prev?.goals ?? [],
    hidden: patch.hidden !== undefined ? patch.hidden : prev?.hidden ?? false,
    updated_by: by, updated_at: new Date().toISOString(),
  };
  const { error } = await createAdminClient().from("un_entities").upsert(row, { onConflict: "org_id,name" });
  return error?.message ?? null;
}

/** The federal members: people who hold platform-wide roles for a federal body (the central authority, the president's office). */
export async function loadMembers(orgId: string): Promise<MemberRow[]> {
  const { data } = await createAdminClient().from("un_federal_members").select("*").eq("org_id", orgId);
  return ((data ?? []) as Record<string, unknown>[])
    .map((r) => ({ id: String(r.id), body: String(r.body), user_id: String(r.user_id), added_by: (r.added_by as string | null) ?? null, added_at: iso(r.added_at ?? r.created_at) ?? new Date(0).toISOString(), removed_at: iso(r.removed_at), removed_by: (r.removed_by as string | null) ?? null }))
    .sort((a, b) => (a.added_at < b.added_at ? -1 : 1));
}

export async function insertMember(orgId: string, row: { body: string; user_id: string; added_by: string }): Promise<string | null> {
  const { error } = await createAdminClient().from("un_federal_members").insert({ org_id: orgId, ...row, added_at: new Date().toISOString() });
  return error?.message ?? null;
}

/** Ends a membership; the row stays in the history. */
export async function endMember(orgId: string, id: string, by: string): Promise<string | null> {
  const { error } = await createAdminClient().from("un_federal_members").update({ removed_at: new Date().toISOString(), removed_by: by }).eq("org_id", orgId).eq("id", id);
  return error?.message ?? null;
}

export async function setJobTitle(orgId: string, userId: string, title: string | null): Promise<string | null> {
  const { error } = await createAdminClient().from("profiles").update({ job_title: title }).eq("org_id", orgId).eq("id", userId);
  return error?.message ?? null;
}
