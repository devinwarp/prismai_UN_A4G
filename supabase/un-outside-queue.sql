-- Outside-information request queue for the licence-renewal agent. Run after supabase/un-agent-runtime.sql.
-- Written, NOT applied to any database, and not tested against Supabase (the code is tested against the
-- offline store). When the agent's required request_outside_information tool is called, a row is added
-- here; an admin answers it on /admin/federal/outside; the answer is appended to the case's hash-chained
-- memory (un_case_memory, kind 'outside_answer') with the answerer's role, and the agent resumes from memory.
-- Viewers read only: the API refuses them and nothing here grants them anything (RLS on, service role only).
create table if not exists public.un_outside_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  case_id text not null,
  sop_id text not null,
  profile text not null,
  question text not null,
  reason text not null default '',
  tried jsonb not null default '[]',
  status text not null default 'open' check (status in ('open','answered')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  answered_by uuid,
  answered_role text,
  answer text,
  memory_hash text,
  check ((status = 'open') or (answer is not null and answered_role is not null and memory_hash is not null))
);
create index if not exists un_outside_requests_org_idx on public.un_outside_requests (org_id, status, created_at desc);
alter table public.un_outside_requests enable row level security;  -- service role only, like the other un_ tables

-- the case memory gains two entry kinds: a person's answer, and a suspected forged document
alter table public.un_case_memory drop constraint if exists un_case_memory_kind_check;
alter table public.un_case_memory add constraint un_case_memory_kind_check
  check (kind in ('case_opened','document_received','check','status','draft','outside_request','note','outside_answer','forgery_suspected'));
