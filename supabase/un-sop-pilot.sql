-- Apply after un-test-sets.sql and un-testgen.sql. The server uses the service role.
create table if not exists public.un_sop_pilot_jobs (
  id uuid primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  use_case_id uuid not null references public.un_use_cases(id) on delete cascade,
  profile text not null,
  active_slot text,
  revision integer not null default 0,
  lease_until timestamptz,
  started_at timestamptz not null,
  job jsonb not null,
  unique (org_id, use_case_id, active_slot)
);
create index if not exists un_sop_pilot_profile_idx on public.un_sop_pilot_jobs (org_id, use_case_id, profile, started_at desc);
alter table public.un_sop_pilot_jobs enable row level security;
revoke all on public.un_sop_pilot_jobs from anon, authenticated;
grant select, insert, update on public.un_sop_pilot_jobs to service_role;
