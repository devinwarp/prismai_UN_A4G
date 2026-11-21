-- The test set of a job profile, as an append-only, hash-chained log. Run after supabase/un-federal.sql.
-- WRITTEN, NOT APPLIED to any database, and not tested against Supabase: the code is tested with pure functions
-- (src/lib/un/test-sets.ts) and with the offline store.
--
-- One chain per use case and job profile (same chain as un_tuning_log, see appendEntry in src/lib/un/tuning.ts).
-- The state is replayed from it (replayTestSet), so nothing can be edited or removed without breaking the chain:
--   created    the tests derived from the skill (payload.blueprints, payload.required_hash)
--   added / edited / retired / restored   the process owner's changes (payload.by is the user id of whoever made it)
--   approved   a version, locked at payload.hash, by payload.approver (a title chosen from the allowed list)
--   withdrawn  an approval taken back, with a reason
-- Deleting a test is "retired": the row stays.
create table if not exists public.un_test_set_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  use_case_id uuid not null references public.un_use_cases(id) on delete cascade,
  profile text not null,
  seq int not null check (seq > 0),
  kind text not null check (kind in ('created','added','edited','retired','restored','approved','withdrawn')),
  at timestamptz not null,
  actor text not null,
  payload jsonb not null,
  prev_hash text not null,
  hash text not null,
  created_at timestamptz not null default now(),
  unique (use_case_id, profile, seq)
);
create index if not exists un_test_set_log_uc_idx on public.un_test_set_log (use_case_id, profile, seq);
alter table public.un_test_set_log enable row level security;  -- service role only, like the other un_ tables

create or replace function public.un_test_set_log_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'un_test_set_log is append-only';
end $$;
drop trigger if exists un_test_set_log_no_update on public.un_test_set_log;
create trigger un_test_set_log_no_update before update on public.un_test_set_log
  for each row execute function public.un_test_set_log_append_only();
drop trigger if exists un_test_set_log_no_delete on public.un_test_set_log;
create trigger un_test_set_log_no_delete before delete on public.un_test_set_log
  for each row execute function public.un_test_set_log_append_only();
