-- The tuning agent's switch, limit and cycles, as an append-only, hash-chained log. Run after supabase/un-federal.sql.
-- WRITTEN, NOT APPLIED to any database, and not tested against Supabase: the code is tested with pure functions
-- (src/lib/un/auto-tune.ts) and with the offline store. Applying it is a person's step.
--
-- One chain per use case (same chain as un_target_log, see appendEntry in src/lib/un/tuning.ts). The state is replayed from it
-- (replayAuto):
--   switched   the business process owner switched auto-tuning on or off (payload.on)
--   threshold  the owner set the held-out alignment limit above which every change waits for a person (payload.value, 0.90 to 0.98)
--   started    a tuning cycle started (payload.by, payload.mode); the dashboard says the agent is tuning while one is open
--   finished   a cycle ended (payload.record: what was applied, what was proposed, what was discarded and why, the held-out
--              alignment before and after, why it stopped, how many model calls it made)
create table if not exists public.un_autotune_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  use_case_id uuid not null references public.un_use_cases(id) on delete cascade,
  seq int not null check (seq > 0),
  kind text not null check (kind in ('switched','threshold','started','finished')),
  at timestamptz not null,
  actor text not null,
  payload jsonb not null,
  prev_hash text not null,
  hash text not null,
  created_at timestamptz not null default now(),
  unique (use_case_id, seq)
);
create index if not exists un_autotune_log_uc_idx on public.un_autotune_log (use_case_id, seq);
alter table public.un_autotune_log enable row level security;  -- service role only, like the other un_ tables

create or replace function public.un_autotune_log_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'un_autotune_log is append-only';
end $$;
drop trigger if exists un_autotune_log_no_update on public.un_autotune_log;
create trigger un_autotune_log_no_update before update on public.un_autotune_log
  for each row execute function public.un_autotune_log_append_only();
drop trigger if exists un_autotune_log_no_delete on public.un_autotune_log;
create trigger un_autotune_log_no_delete before delete on public.un_autotune_log
  for each row execute function public.un_autotune_log_append_only();
