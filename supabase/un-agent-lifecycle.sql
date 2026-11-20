-- Agent lifecycle (slice A): stored pilot eval runs. Run after supabase/un-federal.sql.
-- One row per run of a use case's eval set against one agent configuration version.
-- Append-only history: runs are never updated, so the iteration log shows how results changed.
create table if not exists public.un_eval_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  use_case_id uuid not null references public.un_use_cases(id) on delete cascade,
  agent_version int not null check (agent_version > 0),
  summary jsonb not null,
  results jsonb not null,
  sha256 text not null,
  source text not null default 'simulated',
  created_at timestamptz not null default now()
);
create index if not exists un_eval_runs_uc_idx on public.un_eval_runs (use_case_id, created_at desc);
alter table public.un_eval_runs enable row level security;  -- service role only, like the other un_ tables
