import { createAdminClient } from "@/lib/supabase/admin";
import { GENESIS, verifyLog, type Verification } from "./trace";
import type { RunState } from "./scenario";
import { verdictWriteFor } from "./signature";
import { newTraceRows, rowsMatchLog, type TraceRow } from "./trace-rows";

export interface RunRow {
  id: string;
  scenario_id: string;
  state: RunState;
  head_hash: string | null;
  created_at: string;
  updated_at: string;
}

export const headOf = (s: RunState) => (s.log.length ? s.log[s.log.length - 1].hash : GENESIS);

export async function loadRun(orgId: string, id: string): Promise<RunRow | null> {
  const { data } = await createAdminClient()
    .from("un_runs")
    .select("id, scenario_id, state, head_hash, created_at, updated_at")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  return (data as RunRow | null) ?? null;
}

export async function listRuns(orgId: string) {
  const { data } = await createAdminClient()
    .from("un_runs")
    .select("id, scenario_id, state, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    scenario_id: r.scenario_id as string,
    created_at: r.created_at as string,
    steps: (r.state as RunState).steps.length,
    done: (r.state as RunState).done,
  }));
}

/** Chain check plus the head anchor: a clean chain whose tail was cut off
 * still fails because head_hash no longer matches the last record. */
export function verifyRun(row: RunRow): Verification {
  const v = verifyLog(row.state.log);
  if (v.ok && row.head_hash && row.head_hash !== headOf(row.state)) {
    return { ok: false, length: v.length, brokenAt: v.length, reason: "log was truncated: its last hash no longer matches the stored head" };
  }
  return v;
}

export { signRun, signedVerdict, signatureOf } from "./signature";

export async function loadTraceRows(runRowId: string): Promise<TraceRow[]> {
  const { data } = await createAdminClient().from("un_trace_records").select("run_id, seq, record, prev_hash, hash").eq("run_id", runRowId).order("seq");
  return (data ?? []) as TraceRow[];
}

/** Insert the rows not stored yet. Idempotent: a retry after a failed insert
 * adds only what is missing. No-op for runs started before the migration. */
export async function storeTraceRows(runRowId: string, state: RunState): Promise<string | null> {
  if (!state.trace_rows) return null;
  const stored = (await loadTraceRows(runRowId)).length;
  const rows = newTraceRows(runRowId, state.log, stored);
  if (!rows.length) return null;
  const { error } = await createAdminClient().from("un_trace_records").insert(rows);
  return error?.message ?? null;
}

/** For runs that write rows, the displayed log must equal the append-only rows. */
export async function verifyStoredRows(runRowId: string, state: RunState): Promise<Verification> {
  if (!state.trace_rows) return { ok: true, length: state.log.length, brokenAt: null, reason: null };
  return rowsMatchLog(await loadTraceRows(runRowId), state.log);
}

/** After a SIGN, write the verdict (with run id, head hash and signer) onto the run's
 * use case. Returns an error message, or null (also null when nothing is to be written,
 * e.g. a withheld run). Idempotent: safe to repeat if an earlier attempt failed halfway. */
export async function writeSignedVerdict(orgId: string, runRowId: string, state: RunState): Promise<string | null> {
  const ext = state.state?.ext_id;
  if (!ext) return "this run has no use case to write a verdict to";
  const admin = createAdminClient();
  const { data: uc } = await admin.from("un_use_cases").select("id, client_facing").eq("org_id", orgId).eq("ext_id", ext).maybeSingle();
  if (!uc) return `use case ${ext} is not imported; import the use cases on the Federal page first`;
  let patch: Record<string, unknown> | null;
  try {
    patch = verdictWriteFor(runRowId, state, !!uc.client_facing);
  } catch (e) {
    return e instanceof Error ? e.message : "verdict not allowed";
  }
  if (!patch) return null;
  const { error } = await admin.from("un_use_cases").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", uc.id).eq("org_id", orgId);
  return error?.message ?? null;
}
