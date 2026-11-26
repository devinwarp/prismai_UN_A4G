import { createAdminClient } from "@/lib/supabase/admin";
import { loadChunks } from "./kb";
import { effectiveFor, appendGovLog, factsOf, loadGovLog } from "./gates-store";
import { affectedUseCases, appendGov, replayGov, verifyGov, type GovKind } from "./gates";
import { headOf, storeTraceRows } from "./runs";
import { nextStep, startRun, type RunState } from "./scenario";
import { SCENARIOS } from "./scenarios";
import { loadHitlConfig, loadUnUseCases } from "./store";

/** After a gate change: re-run the verdict of each affected use case as a NEW run (same scenario, same number of
 * staged steps, deterministic agents, the gates as they are now). The old run, its signature and the verdict
 * already written to the use case are never touched; a person signs the new run if they accept it. */
export async function rerunAffected(orgId: string, exts: string[], actor: string): Promise<{ ext_id: string; run_id: string }[]> {
  if (!exts.length) return [];
  const admin = createAdminClient();
  const [ucs, hitl, { data: rows }] = await Promise.all([
    loadUnUseCases(orgId),
    loadHitlConfig(),
    admin.from("un_runs").select("id, scenario_id, state, created_at").eq("org_id", orgId).order("created_at", { ascending: false }),
  ]);
  const out: { ext_id: string; run_id: string }[] = [];
  for (const ext of exts) {
    const uc = ucs.find((u) => u.ext_id === ext);
    const old = (rows ?? []).find((r) => (r.state as RunState).state?.ext_id === ext);
    const sc = old ? SCENARIOS[old.scenario_id as string] : undefined;
    if (!uc || !old || !sc || sc.kind !== "gate") continue;
    const steps = (old.state as RunState).steps.filter((s) => !s.adhoc).length;
    if (!steps) continue; // nothing was judged yet, so there is no verdict to re-run
    const id = crypto.randomUUID();
    const effective = await effectiveFor(orgId, uc);
    const env = {
      hitl: { config: hitl, entity: uc.entity, facts: { client_facing: uc.client_facing, affects_rights: uc.affects_rights, irreversible: uc.irreversible } },
      effective, now: () => new Date().toISOString(), chunks: loadChunks(),
    };
    let state = startRun(sc, `${sc.id}-${id.slice(0, 8)}`);
    for (let i = 0; i < steps; i++) state = await nextStep(sc, state, env);
    const { error } = await admin.from("un_runs").insert({ id, org_id: orgId, scenario_id: sc.id, state, head_hash: headOf(state), created_by: actor });
    if (error) continue;
    await storeTraceRows(id, state);
    out.push({ ext_id: ext, run_id: id });
  }
  return out;
}

/** Writes one governance entry to the hash-chained gate log, then re-runs the verdicts it affects as new runs
 * and logs those too. Callers have already checked the caller is an admin and the payload is valid. */
export async function commitGov(orgId: string, who: { id: string; email: string | null }, kind: GovKind, payload: Record<string, unknown>, changedGate?: string): Promise<{ ok: true; hash: string; reruns: { ext_id: string; run_id: string }[] } | { ok: false; status: number; error: string }> {
  const entries = await loadGovLog(orgId);
  const v = verifyGov(entries);
  if (!v.ok) return { ok: false, status: 409, error: `The gate log failed verification at entry ${v.broken_seq}: ${v.reason}` };
  const actor = who.email ?? who.id;
  const before = replayGov(entries);
  const entry = appendGov(entries[entries.length - 1] ?? null, kind, actor, payload, new Date().toISOString());
  const err = await appendGovLog(orgId, [entry]);
  if (err) return { ok: false, status: 500, error: err };
  const after = replayGov([...entries, entry]);
  const ucs = (await loadUnUseCases(orgId)).map((u) => ({ ext_id: u.ext_id, facts: factsOf(u) }));
  const affected = affectedUseCases(ucs, before, after, changedGate);
  const reruns = await rerunAffected(orgId, affected, who.id);
  if (reruns.length) await appendGovLog(orgId, [appendGov(entry, "rerun", actor, { because: entry.seq, runs: reruns }, new Date().toISOString())]);
  return { ok: true, hash: entry.hash, reruns };
}
