-- The verdict parameters of a job profile, as an append-only, hash-chained log. Run after supabase/un-federal.sql.
-- WRITTEN, NOT APPLIED to any database, and not tested against Supabase: the code is tested with pure functions
-- (src/lib/un/verdict-params.ts) and with the offline store.
--
-- One chain per use case and job profile (same chain as un_tuning_log, see appendEntry in src/lib/un/tuning.ts).
-- The state is replayed from it (replayParams):
--   proposed   thresholds proposed by the process owner (payload.params), checked against the governance floors
--   approved   a proposal approved and locked at payload.hash by payload.approver (a title chosen from the allowed list)
--   withdrawn  an approval taken back, with a reason
-- A pilot run records the hash of the approved parameters it ran under, so a threshold cannot be moved after the
-- results are seen.
create table if not exists public.un_verdict_param_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  use_case_id uuid not null references public.un_use_cases(id) on delete cascade,
  profile text not null,
  seq int not null check (seq > 0),
  kind text not null check (kind in ('proposed','approved','withdrawn')),
  at timestamptz not null,
  actor text not null,
  payload jsonb not null,
  prev_hash text not null,
  hash text not null,
  created_at timestamptz not null default now(),
  unique (use_case_id, profile, seq)
);
create index if not exists un_verdict_param_log_uc_idx on public.un_verdict_param_log (use_case_id, profile, seq);
alter table public.un_verdict_param_log enable row level security;  -- service role only, like the other un_ tables

create or replace function public.un_verdict_param_log_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'un_verdict_param_log is append-only';
end $$;
drop trigger if exists un_verdict_param_log_no_update on public.un_verdict_param_log;
create trigger un_verdict_param_log_no_update before update on public.un_verdict_param_log
  for each row execute function public.un_verdict_param_log_append_only();
drop trigger if exists un_verdict_param_log_no_delete on public.un_verdict_param_log;
create trigger un_verdict_param_log_no_delete before delete on public.un_verdict_param_log
  for each row execute function public.un_verdict_param_log_append_only();
