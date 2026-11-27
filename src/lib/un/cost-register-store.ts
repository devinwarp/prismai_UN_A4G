import { createAdminClient } from "@/lib/supabase/admin";
import { buildLedger } from "./cost-ledger";
import type { RunCost } from "./run-cost.ts";
import { prices } from "./price-store";

// What every use case's runs have cost and how long they worked, for the dashboard register. Read-only: it reads the same stored records the use case's own cost
// panel reads (cost-ledger-store.ts), each table ONCE for the whole organisation, and feeds them to the same pure builder, so the two screens cannot disagree.
// A table that is absent or cannot be read counts as no usage recorded there, never as a cost.

export type { RunCost, RunCostLine } from "./run-cost.ts";

type Row = Record<string, unknown>;
const iso = (v: unknown) => new Date(String(v)).toISOString();
const group = <T,>(rows: T[], key: (r: T) => string) => rows.reduce((m, r) => m.set(key(r), [...(m.get(key(r)) ?? []), r]), new Map<string, T[]>());

export async function loadRunCosts(orgId: string): Promise<Record<string, RunCost>> {
  const db = createAdminClient();
  const all = async (table: string, cols: string): Promise<Row[]> => {
    const { data, error } = await db.from(table).select(cols).eq("org_id", orgId);
    return error ? [] : ((data ?? []) as unknown as Row[]);
  };
  const [gen, pilots, reviews, tuning, watch, sop] = await Promise.all([
    all("un_testgen_log", "use_case_id,profile,kind,at,payload"),
    all("un_lifecycle_pilot_reports", "id,use_case_id,profile,at,basis,plan"),
    all("un_goal_review_log", "use_case_id,profile,kind,at,payload"),
    all("un_autotune_log", "use_case_id,kind,at,payload"),
    all("un_watchdog_log", "use_case_id,kind,at,payload"),
    all("un_sop_pilot_jobs", "use_case_id,profile,started_at,job"),
  ]);
  const by = (rows: Row[]) => group(rows, (r) => String(r.use_case_id));
  const [g, p, rv, t, w, s] = [by(gen), by(pilots), by(reviews), by(tuning), by(watch), by(sop)];
  const logged = (rows: Row[] = []) => rows.map((r) => ({ at: iso(r.at), kind: String(r.kind), payload: (r.payload ?? {}) as Record<string, unknown> }));
  const perProfile = (rows: Row[] = []) => [...group(rows, (r) => String(r.profile))].map(([profile, rs]) => ({ profile, entries: logged(rs) }));
  const prs = prices();
  const out: Record<string, RunCost> = {};
  for (const id of new Set([...g.keys(), ...p.keys(), ...rv.keys(), ...t.keys(), ...w.keys(), ...s.keys()])) {
    const ledger = buildLedger({
      generation: perProfile(g.get(id)),
      pilots: (p.get(id) ?? []).map((r) => ({ profile: String(r.profile), id: String(r.id), at: iso(r.at), basis: r.basis, plan: r.plan })),
      reviews: perProfile(rv.get(id)),
      tuning: logged(t.get(id)),
      watch: logged(w.get(id)),
      sopJobs: (s.get(id) ?? []).map((r) => {
        const job = (r.job ?? {}) as { id?: string; mode?: string; meter?: unknown };
        return { profile: String(r.profile), id: String(job.id ?? r.started_at), at: iso(r.started_at), mode: String(job.mode ?? "pilot"), meter: job.meter };
      }),
    }, prs);
    if (!ledger.entries.length) continue;
    const u = ledger.summary.usage;
    out[id] = {
      usd: ledger.summary.usd, elapsed_ms: u.elapsed_ms ?? 0, calls: u.total.calls, unpriced: ledger.summary.unpriced,
      runs: ledger.entries.map((e) => ({ stage: e.stage, label: e.label, at: e.at, elapsed_ms: e.usage.elapsed_ms ?? 0, calls: e.usage.total.calls, usd: e.usd })),
    };
  }
  return out;
}
