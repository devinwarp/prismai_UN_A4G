-- The output contract of a job profile, as an append-only, hash-chained log. Run after supabase/un-federal.sql.
-- WRITTEN, NOT APPLIED to any database: the code is tested with pure functions (src/lib/un/output-contract-log.ts) and with the offline store.
-- Applying it is a person's step.
--
-- What an agent of a job profile returns for each of its tasks (what the result says, and the outcomes it chooses between) is read off the SOP's own text and then CHECKED
-- BY A PERSON: the job position holder or the process owner may change it and approves it. The skill carries the approved contract, the tests are written against it
-- and the pilot checks it. One chain per use case and job profile (same kind as un_verdict_param_log). The state is replayed from it (replayContracts):
--   proposed   the contract of every task of the profile: derived from the SOP by the platform (agent:contracts) or written by a person (payload.tasks, .source, .by)
--   approved   a proposal approved and locked at payload.hash by payload.approver (a title from the allowed list), with a reason if the approver proposed it
--   withdrawn  an approval taken back, with a reason
create table if not exists public.un_output_contract_log (
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
create index if not exists un_output_contract_log_uc_idx on public.un_output_contract_log (use_case_id, profile, seq);
alter table public.un_output_contract_log enable row level security;  -- service role only, like the other un_ tables
revoke all on public.un_output_contract_log from anon, authenticated;
grant select, insert on public.un_output_contract_log to service_role;

create or replace function public.un_output_contract_log_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'un_output_contract_log is append-only';
end;
$$;
drop trigger if exists un_output_contract_log_no_change on public.un_output_contract_log;
create trigger un_output_contract_log_no_change before update or delete on public.un_output_contract_log
  for each row execute function public.un_output_contract_log_append_only();

-- ---- skill versions ------------------------------------------------------------------------------------------------------------
-- Every build of a job profile's skill that gives a different skill than the latest is a VERSION of it, kept with the skill text, why it was built (profile ticked, knowledge base rebuilt,
-- re-extracted, output format approved or withdrawn) and what it was built from (the contract version and hash, the SOP and its version). Append-only and hash-chained, one chain per use case
-- and job profile (src/lib/un/skill-versions.ts). Nobody approves a version separately: the job holder's approval of the output contract it carries is the approval.
create table if not exists public.un_skill_version_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  use_case_id uuid not null references public.un_use_cases(id) on delete cascade,
  profile text not null,
  seq int not null check (seq > 0),
  kind text not null check (kind in ('built')),
  at timestamptz not null,
  actor text not null,
  payload jsonb not null,
  prev_hash text not null,
  hash text not null,
  created_at timestamptz not null default now(),
  unique (use_case_id, profile, seq)
);
create index if not exists un_skill_version_log_uc_idx on public.un_skill_version_log (use_case_id, profile, seq);
alter table public.un_skill_version_log enable row level security;  -- service role only, like the other un_ tables
revoke all on public.un_skill_version_log from anon, authenticated;
grant select, insert on public.un_skill_version_log to service_role;

create or replace function public.un_skill_version_log_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'un_skill_version_log is append-only';
end;
$$;
drop trigger if exists un_skill_version_log_no_change on public.un_skill_version_log;
create trigger un_skill_version_log_no_change before update or delete on public.un_skill_version_log
  for each row execute function public.un_skill_version_log_append_only();
