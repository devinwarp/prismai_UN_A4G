-- AI-generated test-case proposals, as an append-only, hash-chained log. Run after supabase/un-test-sets.sql.
-- WRITTEN, NOT APPLIED to any database. The code is tested with pure functions (src/lib/un/testgen.ts) and the offline
-- store. A separate table, not new kinds in un_test_set_log, because that table's `kind` check lists the kinds it
-- accepts and this repo does not edit un-test-sets.sql.
--
-- One chain per use case and job profile (appendEntry in src/lib/un/tuning.ts):
--   generated  one generator run: payload.cases (proposals), .rejected, .gaps, .model, .prompt_hash, .scenario_id
--   rejected   a person turned one proposal down: payload.case_id, payload.reason
--   ruled      RESERVED for the pilot comparison (docs/un-testgen-design.md): a reviewer's ruling on a disputed case.
--              Nothing writes it yet; it is listed so adding the comparison needs no change to this constraint.
-- A proposal is accepted by adding it to the test set (un_test_set_log, kind 'added'), which names the person there.
create table if not exists public.un_testgen_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  use_case_id uuid not null references public.un_use_cases(id) on delete cascade,
  profile text not null,
  seq int not null check (seq > 0),
  kind text not null check (kind in ('generated','rejected','ruled')),
  at timestamptz not null,
  actor text not null,
  payload jsonb not null,
  prev_hash text not null,
  hash text not null,
  created_at timestamptz not null default now(),
  unique (use_case_id, profile, seq)
);
create index if not exists un_testgen_log_uc_idx on public.un_testgen_log (use_case_id, profile, seq);
alter table public.un_testgen_log enable row level security;  -- service role only, like the other un_ tables

create or replace function public.un_testgen_log_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'un_testgen_log is append-only';
end $$;
drop trigger if exists un_testgen_log_no_update on public.un_testgen_log;
create trigger un_testgen_log_no_update before update on public.un_testgen_log
  for each row execute function public.un_testgen_log_append_only();
drop trigger if exists un_testgen_log_no_delete on public.un_testgen_log;
create trigger un_testgen_log_no_delete before delete on public.un_testgen_log
  for each row execute function public.un_testgen_log_append_only();
