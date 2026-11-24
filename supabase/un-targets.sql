-- The process targets of a use case, as an append-only, hash-chained log. Run after supabase/un-federal.sql.
-- WRITTEN, NOT APPLIED to any database, and not tested against Supabase: the code is tested with pure functions
-- (src/lib/un/targets.ts) and with the offline store. Applying it is a person's step.
--
-- One chain per use case (same chain as un_verdict_param_log, see appendEntry in src/lib/un/tuning.ts). The state is
-- replayed from it (replayTargets):
--   proposed   targets proposed by the process owner (payload.targets), each linked to a goal of the use case's entity
--   approved   a proposal approved and locked at payload.hash by payload.approver (a title chosen from the allowed list)
--   withdrawn  an approval taken back, with a reason
create table if not exists public.un_target_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  use_case_id uuid not null references public.un_use_cases(id) on delete cascade,
  seq int not null check (seq > 0),
  kind text not null check (kind in ('proposed','approved','withdrawn')),
  at timestamptz not null,
  actor text not null,
  payload jsonb not null,
  prev_hash text not null,
  hash text not null,
  created_at timestamptz not null default now(),
  unique (use_case_id, seq)
);
create index if not exists un_target_log_uc_idx on public.un_target_log (use_case_id, seq);
alter table public.un_target_log enable row level security;  -- service role only, like the other un_ tables

create or replace function public.un_target_log_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'un_target_log is append-only';
end $$;
drop trigger if exists un_target_log_no_update on public.un_target_log;
create trigger un_target_log_no_update before update on public.un_target_log
  for each row execute function public.un_target_log_append_only();
drop trigger if exists un_target_log_no_delete on public.un_target_log;
create trigger un_target_log_no_delete before delete on public.un_target_log
  for each row execute function public.un_target_log_append_only();
