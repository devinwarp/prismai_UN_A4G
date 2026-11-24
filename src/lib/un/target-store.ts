import { createAdminClient } from "@/lib/supabase/admin";
import { ENTITY_GOALS, parseGoals, type EntityGoal } from "./goals";
import { describeTargetStoreError, replayTargets, type TargetEntry, type TargetState } from "./targets";

const entry = (r: Record<string, unknown>) => ({ seq: Number(r.seq), kind: r.kind, at: new Date(String(r.at)).toISOString(), actor: String(r.actor), payload: r.payload, prev_hash: String(r.prev_hash), hash: String(r.hash) }) as TargetEntry;

/** The target log of one use case, oldest first. Throws a readable error when the table cannot be read, so an unread
 * log is never mistaken for an empty one. */
export async function loadTargetLog(orgId: string, useCaseId: string): Promise<TargetEntry[]> {
  const { data, error } = await createAdminClient().from("un_target_log").select("*").eq("org_id", orgId).eq("use_case_id", useCaseId);
  if (error) throw new Error(describeTargetStoreError(error.message));
  return ((data ?? []) as Record<string, unknown>[]).map(entry).sort((a, b) => a.seq - b.seq);
}

/** Returns an error message, or null. A clash on (use case, seq) means someone else wrote first. */
export async function appendTargetLog(orgId: string, useCaseId: string, e: TargetEntry): Promise<string | null> {
  const { error } = await createAdminClient()
    .from("un_target_log")
    .insert({ org_id: orgId, use_case_id: useCaseId, seq: e.seq, kind: e.kind, at: e.at, actor: e.actor, payload: e.payload, prev_hash: e.prev_hash, hash: e.hash });
  return error ? describeTargetStoreError(error.message) : null;
}

export type GoalSource = "database" | "code seed";

/** The goals of one entity, from the database (un_entities) or, when that has none, the seed in the code. The one
 * place new code should read goals from. (Sijil's alignment still reads the database only: see loadEntityGoals.) */
export async function loadGoalsResolved(orgId: string, entity: string): Promise<{ goals: EntityGoal[]; source: GoalSource }> {
  const { data } = await createAdminClient().from("un_entities").select("goals").eq("org_id", orgId).eq("name", entity).maybeSingle();
  const db = parseGoals((data as { goals?: unknown } | null)?.goals);
  return db.length ? { goals: db, source: "database" } : { goals: ENTITY_GOALS[entity] ?? [], source: "code seed" };
}

export interface UseCaseTargets { id: string; ext_id: string; title: string; state: TargetState | null; error: string | null }
export interface EntityView { name: string; goals: EntityGoal[]; source: GoalSource; use_cases: UseCaseTargets[] }

/** Every entity of the organisation with its goals and, for each of its use cases, the state of its targets. Read-only. */
export async function loadEntityOverview(orgId: string): Promise<EntityView[]> {
  const admin = createAdminClient();
  const [ents, ucs, logs] = await Promise.all([
    admin.from("un_entities").select("name, goals").eq("org_id", orgId),
    admin.from("un_use_cases").select("id, ext_id, title, entity").eq("org_id", orgId),
    admin.from("un_target_log").select("*").eq("org_id", orgId),
  ]);
  const fromDb = new Map(((ents.data ?? []) as { name: string; goals: unknown }[]).map((e) => [e.name, parseGoals(e.goals)]));
  const logError = logs.error ? describeTargetStoreError(logs.error.message) : null;
  const byUc = new Map<string, TargetEntry[]>();
  for (const r of (logs.data ?? []) as Record<string, unknown>[]) { const k = String(r.use_case_id); byUc.set(k, [...(byUc.get(k) ?? []), entry(r)]); }
  const rows = ((ucs.data ?? []) as { id: string; ext_id: string; title: string; entity: string }[]);
  const names = [...new Set([...fromDb.keys(), ...rows.map((u) => u.entity), ...Object.keys(ENTITY_GOALS)])].filter(Boolean).sort();
  return names.map((name) => {
    const db = fromDb.get(name) ?? [];
    return {
      name,
      goals: db.length ? db : ENTITY_GOALS[name] ?? [],
      source: db.length ? "database" : "code seed",
      use_cases: rows.filter((u) => u.entity === name).sort((a, b) => a.ext_id.localeCompare(b.ext_id)).map((u) => ({
        id: u.id, ext_id: u.ext_id, title: u.title,
        state: logError ? null : replayTargets((byUc.get(u.id) ?? []).sort((a, b) => a.seq - b.seq)),
        error: logError,
      })),
    };
  });
}
