import { createAdminClient } from "@/lib/supabase/admin";
import { loadAttachedSop, loadProfileRows } from "./profiles-store";
import { loadSop } from "./sop-kb";
import { loadUseCaseSopDocument, profilesForUseCase } from "./sop-version-store";
import { loadUseCase } from "./sijil-store";
import { requiredSopTests, sopTestContext, usesLicensingReference, type SopTestContext } from "./sop-test-context";
import { deriveTests, type Blueprint } from "./test-derive";
import type { TestEntry } from "./test-sets";

/** The test-set log of one use case and job profile, oldest first. Empty if the table is absent
 * (supabase/un-test-sets.sql not applied). */
export async function loadTestLog(orgId: string, useCaseId: string, profile: string): Promise<TestEntry[]> {
  const { data } = await createAdminClient().from("un_test_set_log").select("*").eq("org_id", orgId).eq("use_case_id", useCaseId).eq("profile", profile);
  return ((data ?? []) as Record<string, unknown>[])
    .map((r) => ({ seq: Number(r.seq), kind: r.kind, at: new Date(String(r.at)).toISOString(), actor: String(r.actor), payload: r.payload, prev_hash: String(r.prev_hash), hash: String(r.hash) }) as TestEntry)
    .sort((a, b) => a.seq - b.seq);
}

/** Returns an error message, or null. A clash on (use case, profile, seq) means someone else wrote first. */
export async function appendTestLog(orgId: string, useCaseId: string, profile: string, entry: TestEntry): Promise<string | null> {
  const { error } = await createAdminClient()
    .from("un_test_set_log")
    .insert({ org_id: orgId, use_case_id: useCaseId, profile, seq: entry.seq, kind: entry.kind, at: entry.at, actor: entry.actor, payload: entry.payload, prev_hash: entry.prev_hash, hash: entry.hash });
  return error?.message ?? null;
}

export type Required = { ok: true; sopId: string; required: Blueprint[]; sop?: SopTestContext } | { ok: false; error: string; status: number };

/** The tests this profile requires now, derived from the SOP attached to the use case. The profile must be one the
 * SOP has and must be ticked Automate: tests are for an agent that will do the work. */
export async function requiredFor(orgId: string, useCaseId: string, profile: string): Promise<Required> {
  const sopId = await loadAttachedSop(orgId, useCaseId);
  if (!sopId) return { ok: false, error: "Attach an SOP to this use case first", status: 409 };
  const profiles = await profilesForUseCase(orgId, useCaseId, sopId);
  if (!profiles?.some((p) => p.name === profile)) return { ok: false, error: `${sopId} has no job profile "${profile}"`, status: 400 };
  const rows = await loadProfileRows(orgId, useCaseId, sopId);
  const automated = rows.find((r) => r.profile === profile && r.automate);
  if (!automated) return { ok: false, error: "Tick Automate on this job profile first: tests are written for the agent that will do its work", status: 409 };
  const uc = await loadUseCase(orgId, useCaseId);
  if (!uc) return { ok: false, error: "Use case not found", status: 404 };
  if (!usesLicensingReference(uc.ext_id, sopId)) {
    const document = await loadUseCaseSopDocument(orgId, uc);
    const attached = document?.attached;
    const job = attached?.profiles.find((p) => p.name === profile);
    if (!attached || attached.sop_id !== sopId || !job?.tasks.length) return { ok: false, error: "The attached SOP and its job tasks must be available before writing tests", status: 409 };
    const sop = sopTestContext(attached, uc, job);
    if (!sop.chunks.length) return { ok: false, error: "The attached SOP has no readable passages", status: 409 };
    if (!sop.skill || sop.skill.sha256 !== automated.skill_sha256) {
      return { ok: false, error: "This profile needs a skill for the attached SOP version. Build the knowledge base and refresh the profile skill on the SOP page.", status: 409 };
    }
    return { ok: true, sopId, sop, required: requiredSopTests(sop) };
  }
  const flags = Object.fromEntries(profiles.flatMap((p) => p.tasks.map((t) => [t.id, { client_facing: t.flags.client_facing }])));
  return { ok: true, sopId, required: deriveTests({ sopId, profile, chunks: loadSop(sopId).chunks, flags }) };
}
