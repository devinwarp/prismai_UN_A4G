-- Governance as data, stage 1: the gate log. Run after supabase/un-federal.sql. Never edited into schema.sql.
-- One append-only, hash-chained log per organisation (same chain as un_tuning_log, see appendEntry in
-- src/lib/un/tuning.ts). Everything else is replayed from it (replayGov in src/lib/un/gates.ts):
--   gate_added / gate_changed  an admin-defined gate (payload.def), signed off by an admin (payload.signed_off_by)
--   use_case_gate              a gate a use case adds to its rule set's (payload.ext_id, gate, reason, source)
--   waiver                     a rule-set gate waived for one use case (payload.approver, reason)
--   rerun                      verdicts re-run as NEW runs after a change (payload.runs)
-- The shipped nine gates and three rule sets are seeded from data/un-governance.json, not from this table.
create table if not exists public.un_gate_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  seq int not null check (seq > 0),
  kind text not null,
  at timestamptz not null,
  actor text not null,
  payload jsonb not null,
  prev_hash text not null,
  hash text not null,
  created_at timestamptz not null default now(),
  unique (org_id, seq)
);
create index if not exists un_gate_log_org_idx on public.un_gate_log (org_id, seq);
alter table public.un_gate_log enable row level security;  -- service role only, like the other un_ tables
