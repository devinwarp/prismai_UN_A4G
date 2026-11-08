-- Core auth + organisation schema. Run first, then un-federal.sql.
-- Run in the Supabase SQL editor (or via `supabase db query`).

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'suspended')),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  job_title text,
  role text not null default 'employee'
    check (role in ('platform', 'admin', 'employee', 'viewer')),
  org_id uuid references public.organizations (id),
  created_at timestamptz not null default now()
);

create index if not exists profiles_org_idx on public.profiles (org_id);

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;

-- Admin check kept in a non-exposed schema; security definer avoids
-- recursive RLS when profiles policies reference profiles.
create schema if not exists private;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated, anon;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or private.is_admin());

drop policy if exists orgs_select on public.organizations;
create policy orgs_select on public.organizations for select
  to authenticated
  using (true);
