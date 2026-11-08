-- UN hackathon federal layer. Separate from schema.sql on purpose: copy this
-- file into main as its own migration. Service-role access only (RLS on, no
-- policies), the same way the admin routes read everything else.
create table if not exists public.un_policy (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  name text not null,
  jurisdiction text not null,
  source_url text,
  target_percent numeric not null check (target_percent between 0 and 100),
  deadline date,
  counting_verdicts text[] not null default '{GO_AUTONOMOUS,GO_SUPERVISED}',
  updated_at timestamptz not null default now()
);

create table if not exists public.un_use_cases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  ext_id text not null,
  entity text not null,
  entity_sector text,
  title text not null,
  quadrant text not null
    check (quadrant in ('Internal Agents','Internal RAG','External Agents','External RAG')),
  matrix_examples text,
  departments text,
  client_facing boolean not null default false,
  hitl_rule text,
  description text,
  stage text not null default 'intake'
    check (stage in ('intake','sop','org','scout','pilot','approved','deployed')),
  verdict text
    check (verdict in ('GO_AUTONOMOUS','GO_SUPERVISED','ASSISTANT_ONLY','NO_GO','ESCALATE')),
  compliant boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, ext_id)
);
create index if not exists un_use_cases_org_idx on public.un_use_cases (org_id);

alter table public.un_policy enable row level security;
alter table public.un_use_cases enable row level security;

-- Scenario runs: the whole RunState (events released so far, thread, hash-
-- chained trace log) as jsonb. head_hash is the last trace hash, kept in its
-- own column so truncating the log's tail inside the jsonb is still caught.
create table if not exists public.un_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  scenario_id text not null,
  state jsonb not null,
  head_hash text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists un_runs_org_idx on public.un_runs (org_id, created_at desc);
alter table public.un_runs enable row level security;

-- Sijil runs (simulated adapter until the live API is known) and filed pilot
-- reports. Reports are append-only history; the latest one is current.
create table if not exists public.un_sijil_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  use_case_id uuid not null references public.un_use_cases(id) on delete cascade,
  run_no int not null check (run_no > 0),
  source text not null,
  actions int not null,
  accuracy numeric not null,
  hallucination_rate numeric not null,
  goal_alignment numeric not null,
  rejects jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (use_case_id, run_no)
);
create index if not exists un_sijil_runs_uc_idx on public.un_sijil_runs (use_case_id, run_no);

create table if not exists public.un_pilot_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  use_case_id uuid not null references public.un_use_cases(id) on delete cascade,
  runs int not null,
  pass boolean not null,
  content text not null,
  sha256 text not null,
  created_at timestamptz not null default now()
);
create index if not exists un_pilot_reports_uc_idx on public.un_pilot_reports (use_case_id, created_at desc);

alter table public.un_sijil_runs enable row level security;
alter table public.un_pilot_reports enable row level security;

-- Per-entity human-in-the-loop rules. One row per (entity, rule); enabled=false
-- means that entity switched the rule off (absent = on). Optional use-case
-- facts the rules read are added here, not in schema.sql.
create table if not exists public.un_hitl_rules (
  org_id uuid not null references public.organizations(id) on delete cascade,
  entity text not null,
  rule text not null check (rule in ('client_facing_final_approval','rights_or_fees_human_decision','irreversible_human_approval')),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (org_id, entity, rule)
);
alter table public.un_hitl_rules enable row level security;

alter table public.un_use_cases add column if not exists affects_rights boolean not null default false;
alter table public.un_use_cases add column if not exists irreversible boolean not null default false;
