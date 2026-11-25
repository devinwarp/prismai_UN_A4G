-- Entity administration: hide an entity, the federal members (people above any entity), custom SOPs and rerun requests. Run after supabase/un-federal-t1.sql and un-profiles.sql. NOT APPLIED to any database.
-- An admin can add an entity, edit its goals, hide it (reversible: its use cases leave the dashboard counts and lists, nothing is deleted),
-- record the federal members, and keep SOPs in versions.
alter table public.un_entities add column if not exists hidden boolean not null default false;
alter table public.un_entities add column if not exists updated_by uuid;
alter table public.un_entities add column if not exists updated_at timestamptz;

-- Federal members: the people ABOVE any one entity (the federal central authority, the president's office) who hold platform-wide roles.
-- An entity's own people are not stored: a person belongs to an entity when they hold a live role on one of its use cases (un_role_assignments),
-- so granting that role is how someone is added to an entity. A federal membership ends rather than being deleted; the row stays in the history.
create table if not exists public.un_federal_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  body text not null,
  user_id uuid not null,
  added_by uuid,
  added_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid
);
create unique index if not exists un_federal_members_live on public.un_federal_members (org_id, lower(body), user_id) where removed_at is null;
alter table public.un_federal_members enable row level security;  -- service role only, like the other un_ tables

-- SOP versions. An SOP is a root (sop_id) with versions 1, 2, 3 ... Version 1 of a shipped sample is its file and has no row; every later version, and every SOP an
-- admin pasted (its version 1 included), is a row with the job profiles derived from it and a summary of what changed against the version before.
create table if not exists public.un_sop_versions (
  org_id uuid not null references public.organizations(id) on delete cascade,
  sop_id text not null,
  version int not null check (version >= 1),
  title text not null,
  body text not null,
  profiles jsonb not null default '[]',
  changes jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (org_id, sop_id, version)
);
alter table public.un_sop_versions enable row level security;  -- service role only

-- A use case is attached to one specific version of an SOP. A use case that is deployed stays on its version (frozen) until a change request moves it.
alter table public.un_use_case_sops add column if not exists version int not null default 1;

-- A business process owner's request to move a deployed use case to a newer SOP version: why, and a plan. An admin applies or declines it.
create table if not exists public.un_sop_change_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  use_case_id uuid not null references public.un_use_cases(id) on delete cascade,
  sop_id text not null,
  from_version int not null,
  to_version int not null,
  requested_by uuid not null,
  requested_email text,
  reason text not null,
  plan text not null,
  requested_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'applied', 'declined')),
  resolved_by uuid,
  resolved_at timestamptz,
  note text,
  run_id uuid
);
create unique index if not exists un_sop_change_requests_open on public.un_sop_change_requests (org_id, use_case_id) where status = 'open';
alter table public.un_sop_change_requests enable row level security;  -- service role only

-- A business process owner's request to rerun a use case that is in production, with a reason. The rerun stays off until a request is open; a rerun uses it up.
create table if not exists public.un_rerun_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  use_case_id uuid not null references public.un_use_cases(id) on delete cascade,
  requested_by uuid not null,
  requested_email text,
  reason text not null,
  requested_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'done')),
  resolved_by uuid,
  resolved_at timestamptz,
  run_id uuid
);
create unique index if not exists un_rerun_requests_open on public.un_rerun_requests (org_id, use_case_id) where status = 'open';
alter table public.un_rerun_requests enable row level security;  -- service role only
