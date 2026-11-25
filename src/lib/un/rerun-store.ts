import { createAdminClient } from "@/lib/supabase/admin";
import type { CountryEntry } from "./country";
import type { RunState } from "./scenario";
import { SCENARIOS } from "./scenarios";
import { staleSince, type RerunRequest, type RerunState } from "./rerun";

// Rerun requests (supabase/un-entities-admin.sql, not applied yet) and what the dashboard needs to know about each use case's last run.
// Empty when the table is absent: nothing is requested and every use case that has a run can be rerun if it is not deployed.

const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);
const req = (r: Record<string, unknown>): RerunRequest => ({
  id: String(r.id), use_case_id: String(r.use_case_id), requested_by: String(r.requested_by ?? ""), requested_email: (r.requested_email as string | null) ?? null,
  reason: String(r.reason ?? ""), requested_at: iso(r.requested_at ?? r.created_at) ?? new Date(0).toISOString(),
  status: r.status === "done" ? "done" : "open", resolved_by: (r.resolved_by as string | null) ?? null, resolved_at: iso(r.resolved_at), run_id: (r.run_id as string | null) ?? null,
});

export async function loadRequests(orgId: string): Promise<RerunRequest[]> {
  const { data } = await createAdminClient().from("un_rerun_requests").select("*").eq("org_id", orgId);
  return ((data ?? []) as Record<string, unknown>[]).map(req).sort((a, b) => (a.requested_at < b.requested_at ? -1 : 1));
}
export async function insertRequest(orgId: string, row: { use_case_id: string; requested_by: string; requested_email: string | null; reason: string }): Promise<string | null> {
  const { error } = await createAdminClient().from("un_rerun_requests").insert({ org_id: orgId, ...row, status: "open", requested_at: new Date().toISOString() });
  return error?.message ?? null;
}
/** The request a rerun used up: it stays in the history with who reran and the new run's id. */
export async function resolveRequest(orgId: string, id: string, by: string, runId: string): Promise<string | null> {
  const { error } = await createAdminClient().from("un_rerun_requests").update({ status: "done", resolved_by: by, resolved_at: new Date().toISOString(), run_id: runId }).eq("org_id", orgId).eq("id", id);
  return error?.message ?? null;
}

/** For each use case: does it have an earlier run to repeat, when was that, is a request open, and have its rules or SOP changed since. */
export async function loadRerunView(orgId: string, ucs: { id: string; ext_id: string }[], o: { log: CountryEntry[]; countryOf: (ucId: string) => string }): Promise<Record<string, RerunState>> {
  const [runs, requests] = await Promise.all([
    createAdminClient().from("un_runs").select("id, scenario_id, state, created_at").eq("org_id", orgId).order("created_at", { ascending: false }),
    loadRequests(orgId).catch(() => [] as RerunRequest[]),
  ]);
  const rows = (runs.data ?? []) as { scenario_id: string; state: RunState; created_at: string }[];
  const out: Record<string, RerunState> = {};
  for (const u of ucs) {
    // the same test as gates-rerun.ts: the latest run of a gate scenario for this use case, with at least one judged step
    const last = rows.find((r) => (r.state as RunState).state?.ext_id === u.ext_id);
    const sc = last ? SCENARIOS[last.scenario_id] : undefined;
    const judged = last ? (last.state as RunState).steps.filter((s) => !s.adhoc).length > 0 : false;
    const hasRun = !!last && sc?.kind === "gate" && judged;
    const lastRunAt = last ? iso(last.created_at) : null;
    out[u.id] = {
      hasRun, lastRunAt,
      open: requests.filter((r) => r.use_case_id === u.id && r.status === "open").at(-1) ?? null,
      stale: hasRun ? staleSince(o.log, { country: o.countryOf(u.id), ext: u.ext_id, lastRunAt }) : null,
    };
  }
  return out;
}
