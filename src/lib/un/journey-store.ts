import { createAdminClient } from "@/lib/supabase/admin";
import { alignment, type EvalSummary } from "./eval-run";
import { evalSetFor } from "./evalset";
import { automationOf, type Automation } from "./automation";
import { journeyStatus, type Journey } from "./journey";
import { loadReleaseCached } from "./release-cached";
import { gateAcceptance } from "./journey-gates";
import type { UnUseCaseState } from "./model";
import type { LogEntry } from "./tuning";
import { replayTestSet, inForce, type TestEntry } from "./test-sets";
import { replayParams, type ParamEntry } from "./verdict-params";
import { replay as replayWatch, type WatchEntry } from "./watchdog";
import { checkSopKbFor } from "./sop-kb-app";
import { hasVerdictPath } from "./sop-pilot-order";
import { profileIndex } from "./sop-version-store";
import type { JobProfile } from "./sop/profiles";

type Row = Record<string, unknown>;
const tickedFlags = (on: Row[], all: JobProfile[] | null) => {
  const ps = (all ?? []).filter((p) => on.some((r) => r.profile === p.name));
  return { client_facing: ps.some((p) => p.flags.client_facing), affects_rights: ps.some((p) => p.flags.affects_rights), irreversible: ps.some((p) => p.flags.irreversible) };
};
const group = (rows: Row[] | null): Map<string, Row[]> => {
  const m = new Map<string, Row[]>();
  for (const r of rows ?? []) m.set(String(r.use_case_id), [...(m.get(String(r.use_case_id)) ?? []), r]);
  return m;
};
const asLog = <T,>(rows: Row[] = []): T[] =>
  rows.map((r) => ({ seq: Number(r.seq), kind: r.kind, at: new Date(String(r.at)).toISOString(), actor: String(r.actor), payload: r.payload, prev_hash: String(r.prev_hash), hash: String(r.hash) }) as T).sort((a, b) => (a as { seq: number }).seq - (b as { seq: number }).seq);

type JourneyUseCase = Pick<UnUseCaseState, "id" | "ext_id" | "verdict" | "verdict_run_id" | "client_facing" | "affects_rights" | "irreversible">;

/** Journeys and attached SOP IDs for the given use cases, using the same bulk reads. */
export async function loadJourneyDetails(orgId: string, ucs: JourneyUseCase[]): Promise<{ journeys: Map<string, Journey>; attachedSopIds: Map<string, string>; automation: Map<string, Automation> }> {
  const db = createAdminClient();
  const [sops, profiles, evals, tuning, watch, testLog, paramLog, pilots] = await Promise.all([
    db.from("un_use_case_sops").select("*").eq("org_id", orgId),
    db.from("un_job_profiles").select("*").eq("org_id", orgId).eq("automate", true),
    db.from("un_eval_runs").select("use_case_id, summary, created_at").eq("org_id", orgId).order("created_at", { ascending: false }),
    db.from("un_tuning_log").select("*").eq("org_id", orgId),
    db.from("un_watchdog_log").select("*").eq("org_id", orgId),
    db.from("un_test_set_log").select("*").eq("org_id", orgId),
    db.from("un_verdict_param_log").select("*").eq("org_id", orgId),
    db.from("un_lifecycle_pilot_reports").select("use_case_id, profile, at, report, basis").eq("org_id", orgId),
  ]);
  const sopOf = new Map((sops.data ?? []).map((r: Row) => [String(r.use_case_id), String(r.sop_id)]));
  const ticks = group(profiles.data as Row[] | null), runs = group(evals.data as Row[] | null), tl = group(tuning.data as Row[] | null), wl = group(watch.data as Row[] | null);
  const tLog = group(testLog.data as Row[] | null), pLog = group(paramLog.data as Row[] | null), pr = group(pilots.data as Row[] | null);
  const forProfile = (rows: Row[] | undefined, profile: string) => asLog<never>((rows ?? []).filter((r) => r.profile === profile));
  const kb = new Map<string, boolean>();
  const out = new Map<string, Journey>();
  const attachedSopIds = new Map<string, string>();
  const automation = new Map<string, Automation>();
  const profilesAt = await profileIndex(orgId).catch(() => null);
  const versionOf = new Map((sops.data ?? []).map((r: Row) => [String(r.use_case_id), Number(r.version ?? 1) || 1]));
  for (const u of ucs) {
    const sopId = sopOf.get(u.id) ?? null;
    if (sopId) attachedSopIds.set(u.id, sopId);
    const all = sopId && profilesAt ? profilesAt(sopId, versionOf.get(u.id) ?? 1) : null;
    const on = (ticks.get(u.id) ?? []).filter((r) => r.sop_id === sopId && all?.some((p) => p.name === r.profile));
    const kbKey = `${sopId}@${versionOf.get(u.id) ?? 1}`;
    if (sopId && !kb.has(kbKey)) kb.set(kbKey, (await checkSopKbFor(orgId, sopId, versionOf.get(u.id) ?? 1).catch(() => ({ ok: false }))).ok);
    automation.set(u.id, automationOf({ ticked: on.length, deployed: replayWatch(asLog<WatchEntry>(wl.get(u.id))).deployed }));
    const r = runs.get(u.id) ?? [];
    out.set(u.id, journeyStatus({
      sop: { attached: !!sopId, profiles: all?.length ?? 0, ticked: on.length, kbOk: sopId ? !!kb.get(kbKey) : false, skills: on.filter((x) => x.skill_sha256).length },
      gates: await gateAcceptance(orgId, u, tickedFlags(on, all)),
      verdict: u.verdict,
      noVerdictPath: !hasVerdictPath(u.ext_id),
      tests: {
        ticked: on.length,
        ready: on.filter((r) => inForce(replayTestSet(forProfile(tLog.get(u.id), String(r.profile)) as TestEntry[])) && !!replayParams(forProfile(pLog.get(u.id), String(r.profile)) as ParamEntry[]).approved).length,
      },
      pilot: (() => {
        const latest = (profile: string) => (pr.get(u.id) ?? []).filter((x) => x.profile === profile).sort((a, b) => (String(a.at) < String(b.at) ? 1 : -1))[0] as { report: { conclusive: boolean; failed: string[]; params_hash: string; test_set_hash: string } } | undefined;
        const ps = on.map((r) => latest(String(r.profile)));
        return { ticked: on.length, run: ps.filter(Boolean).length, met: ps.filter((x) => x && x.report.conclusive && x.report.failed.length === 0).length };
      })(),
      evalSet: evalSetFor(u.ext_id).length > 0,
      evalRuns: r.length,
      evalMet: r[0] ? alignment(r[0].summary as EvalSummary).met : null,
      tuning: asLog<LogEntry>(tl.get(u.id)),
      watch: asLog<WatchEntry>(wl.get(u.id)),
      // worked out for one use case only (its own page): a list of many would read several logs for each
      ...(ucs.length === 1 && sopId ? { release: await loadReleaseCached(orgId, u.id).then((x) => ({ ready: x.ok, blockers: x.blockers.length })).catch(() => undefined) } : {}),
    }));
  }
  return { journeys: out, attachedSopIds, automation };
}

export async function loadJourneys(orgId: string, ucs: JourneyUseCase[]): Promise<Map<string, Journey>> {
  return (await loadJourneyDetails(orgId, ucs)).journeys;
}
