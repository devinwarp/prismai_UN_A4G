-- The SOP structuring log: a model drafts a structured version of a loosely written SOP, a person reviews, edits and approves it.
-- Run after supabase/un-federal.sql. WRITTEN, NOT APPLIED to any database: the code is tested with pure functions
-- (src/lib/un/sop-structure.ts) and with the offline store. Applying it is a person's step.
--
-- One append-only log per use case; the state is replayed from it (replayStructure):
--   drafted    the source text and the model's structured draft with its checks (payload.source, .model, .checks, .llm)
--   edited     a person's edit of the pending draft (payload.model, .checks)
--   approved   the structure a person approved, the hashes of the source and of the canonical SOP written from it, and the version it became
--   withdrawn  the pending draft dropped, with a reason
create table if not exists public.un_sop_structure_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  use_case_id uuid not null references public.un_use_cases(id) on delete cascade,
  seq int not null check (seq > 0),
  kind text not null check (kind in ('drafted','edited','approved','withdrawn')),
  at timestamptz not null,
  actor text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (use_case_id, seq)
);
create index if not exists un_sop_structure_log_uc_idx on public.un_sop_structure_log (use_case_id, seq);
alter table public.un_sop_structure_log enable row level security;  -- service role only, like the other un_ tables
revoke all on public.un_sop_structure_log from anon, authenticated;
grant select, insert on public.un_sop_structure_log to service_role;
