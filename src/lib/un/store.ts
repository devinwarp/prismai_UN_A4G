import { createAdminClient } from "@/lib/supabase/admin";
import { engineValues } from "./guard";
import { parseGoals, type EntityGoal } from "./goals";
import { isHitlRule, type HitlConfig } from "./hitl";
import { DEFAULT_POLICY, type Policy, type UnUseCase, type UnUseCaseState } from "./model";

export async function loadPolicy(orgId: string): Promise<Policy> {
  const { data } = await createAdminClient()
    .from("un_policy")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data) return DEFAULT_POLICY;
  return {
    name: data.name,
    jurisdiction: data.jurisdiction,
    source_url: data.source_url,
    target_percent: Number(data.target_percent),
    deadline: data.deadline,
    counting_verdicts: data.counting_verdicts,
  };
}

export async function loadUnUseCases(orgId: string): Promise<UnUseCaseState[]> {
  const { data } = await createAdminClient()
    .from("un_use_cases")
    .select("*")
    .eq("org_id", orgId)
    .order("ext_id");
  // Only engine-written verdicts and attested compliance reach the dashboard (I-1).
  return ((data ?? []) as UnUseCaseState[]).map(engineValues);
}

/** Re-import updates descriptive fields only; stage/verdict/compliant keep
 * their values because they are absent from the upsert payload. */
export async function importUnUseCases(orgId: string, ucs: UnUseCase[]) {
  const { error } = await createAdminClient()
    .from("un_use_cases")
    .upsert(
      ucs.map((u) => ({ ...u, org_id: orgId, updated_at: new Date().toISOString() })),
      { onConflict: "org_id,ext_id" },
    );
  return error?.message ?? null;
}

/** Rows are the rules an entity switched off (see un_hitl_rules). */
export async function loadHitlConfig(orgId: string): Promise<HitlConfig> {
  const { data } = await createAdminClient().from("un_hitl_rules").select("entity, rule, enabled").eq("org_id", orgId);
  const cfg: HitlConfig = {};
  for (const r of data ?? []) if (!r.enabled && isHitlRule(r.rule)) (cfg[r.entity] ??= []).push(r.rule);
  return cfg;
}

/** Goals seeded for an entity (un_entities). Empty before the migration/seed,
 * in which case Sijil keeps its simulated goal-alignment figure. */
export async function loadEntityGoals(orgId: string, entity: string): Promise<EntityGoal[]> {
  const { data } = await createAdminClient().from("un_entities").select("goals").eq("org_id", orgId).eq("name", entity).maybeSingle();
  return parseGoals(data?.goals);
}
