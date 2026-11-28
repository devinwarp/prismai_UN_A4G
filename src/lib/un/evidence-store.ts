import { createAdminClient } from "@/lib/supabase/admin";
import type { HitlFacts } from "./hitl.ts";
import { effectiveGates, type Effective } from "./gates";
import { factsOf, loadGov } from "./gates-store";
import type { RunRow } from "./runs";
import { evidenceScenarioId } from "./evidence-scenario";
import { profileIndex } from "./sop-version-store";
import type { UnUseCaseState } from "./model";

type Uc = Pick<UnUseCaseState, "id" | "ext_id" | "client_facing" | "affects_rights" | "irreversible">;

/** The risk flags the verdict is judged under: the use case's own, widened by the flags of its ticked SOP job profiles (a flag is on if any ticked profile has it).
 * The same facts the journey's gates stage uses (journey-store.ts), so the evidence a person records and the acceptance the journey reads agree on which gates apply. */
export async function evidenceFacts(orgId: string, uc: Uc): Promise<HitlFacts> {
  const own = factsOf(uc);
  const db = createAdminClient();
  const [{ data: sop }, { data: ticks }] = await Promise.all([
    db.from("un_use_case_sops").select("sop_id, version").eq("org_id", orgId).eq("use_case_id", uc.id).maybeSingle(),
    db.from("un_job_profiles").select("profile, sop_id").eq("org_id", orgId).eq("use_case_id", uc.id).eq("automate", true),
  ]);
  const sopId = sop ? String(sop.sop_id) : null;
  const all = sopId ? (await profileIndex(orgId).catch(() => null))?.(sopId, Number(sop?.version ?? 1) || 1) ?? null : null;
  const on = (all ?? []).filter((p) => (ticks ?? []).some((r) => r.profile === p.name && r.sop_id === sopId));
  return {
    client_facing: own.client_facing || on.some((p) => p.flags.client_facing),
    affects_rights: own.affects_rights || on.some((p) => p.flags.affects_rights),
    irreversible: own.irreversible || on.some((p) => p.flags.irreversible),
  };
}

export async function evidenceEffective(orgId: string, uc: Uc): Promise<{ facts: HitlFacts; effective: Effective }> {
  const facts = await evidenceFacts(orgId, uc);
  return { facts, effective: effectiveGates({ ext: uc.ext_id, facts, gov: await loadGov(orgId) }) };
}

/** The use case's latest evidence run, signed or not, or null. */
export async function latestEvidenceRun(orgId: string, ext: string): Promise<RunRow | null> {
  const { data } = await createAdminClient()
    .from("un_runs").select("id, scenario_id, state, head_hash, created_at, updated_at")
    .eq("org_id", orgId).eq("scenario_id", evidenceScenarioId(ext)).order("created_at", { ascending: false }).limit(1);
  return ((data ?? [])[0] as RunRow | undefined) ?? null;
}
