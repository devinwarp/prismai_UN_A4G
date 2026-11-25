-- Role assignments: who holds which role, for the whole organisation or for one use case.
-- Run after supabase/un-federal.sql, then apply supabase/un-single-process-owner.sql.
--
-- Until assignments exist, access works as before: profiles.role = 'admin' holds every role at organisation scope
-- and 'viewer' can only read (see LEGACY in src/lib/un/authz.ts). An assignment adds to that; it never removes it.
-- The person who holds a job title (the minimum org chart) is read from profiles.job_title.
--
-- role: platform_admin | governance_admin | process_owner | test_author | operator | viewer
-- use_case_id null  = the role is held for the whole organisation; set = for that use case only.
-- A revoked assignment keeps its row (revoked_at) so the history of who could do what is never lost.
create table if not exists public.un_role_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('platform_admin','governance_admin','process_owner','test_author','operator','viewer')),
  use_case_id uuid references public.un_use_cases(id) on delete cascade,
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id)
);
-- one live assignment per person, role and scope
create unique index if not exists un_role_assignments_live_idx
  on public.un_role_assignments (org_id, user_id, role, coalesce(use_case_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where revoked_at is null;
create index if not exists un_role_assignments_user_idx on public.un_role_assignments (org_id, user_id) where revoked_at is null;
alter table public.un_role_assignments enable row level security;  -- service role only, like the other un_ tables
