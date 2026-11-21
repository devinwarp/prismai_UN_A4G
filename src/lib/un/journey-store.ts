import { createAdminClient } from "@/lib/supabase/admin";
import { alignment, type EvalSummary } from "./eval-run";
import { evalSetFor } from "./evalset";
import { journeyStatus, type Journey } from "./journey";
import { gateAcceptance } from "./journey-gates";
import type { UnUseCaseState } from "./model";
import type { LogEntry } from "./tuning";
import type { WatchEntry } from "./watchdog";
import { checkSopKb } from "./skill-extract";
import { profilesOf } from "./sop/data";

type Row = Record<string, unknown>;
const group = (rows: Row[] | null): Map<string, Row[]> => {
  const m = new Map<string, Row[]>();
  for (const r of rows ?? []) m.set(String(r.use_case_id), [...(m.get(String(r.use_case_id)) ?? []), r]);
  return m;
};
const asLog = <T,>(rows: Row[] = []): T[] =>
  rows.map((r) => ({ seq: Number(r.seq), kind: r.kind, at: new Date(String(r.at)).toISOString(), actor: String(r.actor), payload: r.payload, prev_hash: String(r.prev_hash), hash: String(r.hash) }) as T).sort((a, b) => (a as { seq: number }).seq - (b as { seq: number }).seq);

/** Journey for each given use case, derived from the stored records (one query per table for the whole org). */
export async function loadJourneys(orgId: string, ucs: Pick<UnUseCaseState, "id" | "ext_id" | "verdict">[]): Promise<Map<string, Journey>> {
  const db = createAdminClient();
  const [sops, profiles, evals, tuning, watch] = await Promise.all([
    db.from("un_use_case_sops").select("*").eq("org_id", orgId),
    db.from("un_job_profiles").select("*").eq("org_id", orgId).eq("automate", true),
    db.from("un_eval_runs").select("use_case_id, summary, created_at").eq("org_id", orgId).order("created_at", { ascending: false }),
    db.from("un_tuning_log").select("*").eq("org_id", orgId),
    db.from("un_watchdog_log").select("*").eq("org_id", orgId),
  ]);
  const sopOf = new Map((sops.data ?? []).map((r: Row) => [String(r.use_case_id), String(r.sop_id)]));
  const ticks = group(profiles.data as Row[] | null), runs = group(evals.data as Row[] | null), tl = group(tuning.data as Row[] | null), wl = group(watch.data as Row[] | null);
  const kb = new Map<string, boolean>();
  const out = new Map<string, Journey>();
  for (const u of ucs) {
    const sopId = sopOf.get(u.id) ?? null;
    const all = sopId ? profilesOf(sopId) : null;
    const on = (ticks.get(u.id) ?? []).filter((r) => r.sop_id === sopId && all?.some((p) => p.name === r.profile));
    if (sopId && !kb.has(sopId)) kb.set(sopId, checkSopKb(sopId).ok);
    const r = runs.get(u.id) ?? [];
    out.set(u.id, journeyStatus({
      sop: { attached: !!sopId, profiles: all?.length ?? 0, ticked: on.length, kbOk: sopId ? !!kb.get(sopId) : false, skills: on.filter((x) => x.skill_sha256).length },
      gates: await gateAcceptance(orgId, u.id),
      verdict: u.verdict,
      evalSet: evalSetFor(u.ext_id).length > 0,
      evalRuns: r.length,
      evalMet: r[0] ? alignment(r[0].summary as EvalSummary).met : null,
      tuning: asLog<LogEntry>(tl.get(u.id)),
      watch: asLog<WatchEntry>(wl.get(u.id)),
    }));
  }
  return out;
}
