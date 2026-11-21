-- Job profiles and the Automate checkbox. Run after supabase/un-federal.sql. Not applied by this repo.
-- One SOP is attached to a use case; each of its job profiles can be ticked "Automate" (admin only).
-- Only ticked profiles are assessed. Ticking records the skill file extracted from the SOP knowledge base.
create table if not exists public.un_use_case_sops (
  org_id uuid not null references public.organizations(id) on delete cascade,
  use_case_id uuid not null references public.un_use_cases(id) on delete cascade,
  sop_id text not null,
  attached_by uuid,
  attached_at timestamptz not null default now(),
  primary key (org_id, use_case_id)
);
alter table public.un_use_case_sops enable row level security;  -- service role only, like the other un_ tables

create table if not exists public.un_job_profiles (
  org_id uuid not null references public.organizations(id) on delete cascade,
  use_case_id uuid not null references public.un_use_cases(id) on delete cascade,
  sop_id text not null,
  profile text not null,
  automate boolean not null default false,
  skill_path text,
  skill_sha256 text,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (org_id, use_case_id, sop_id, profile)
);
alter table public.un_job_profiles enable row level security;  -- service role only
