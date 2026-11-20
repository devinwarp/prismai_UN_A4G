-- Agent runtime: persistent case memory for the licence-renewal agent. Run after supabase/un-federal.sql.
-- Written, NOT applied to any database, and not tested against Supabase (the code is tested with an
-- in-memory store). One row per memory entry; each entry's hash covers the previous one, so the
-- case history cannot be edited without breaking the chain (replayCase in src/lib/un/case-memory.ts).
-- Control 4 of SOP-LIC-014: only extracted fields, the image SHA-256 and the OCR confidence are stored,
-- never the image. kind: case_opened | document_received | check | status | draft | outside_request | note.
create table if not exists public.un_case_memory (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  case_id text not null,
  seq int not null check (seq > 0),
  kind text not null check (kind in ('case_opened','document_received','check','status','draft','outside_request','note')),
  at timestamptz not null,
  actor text not null,
  payload jsonb not null,
  prev_hash text not null,
  hash text not null,
  created_at timestamptz not null default now(),
  unique (org_id, case_id, seq)
);
create index if not exists un_case_memory_case_idx on public.un_case_memory (org_id, case_id, seq);
alter table public.un_case_memory enable row level security;  -- service role only, like the other un_ tables

create or replace function public.un_case_memory_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'un_case_memory is append-only';
end $$;
drop trigger if exists un_case_memory_no_update on public.un_case_memory;
create trigger un_case_memory_no_update before update on public.un_case_memory
  for each row execute function public.un_case_memory_append_only();
drop trigger if exists un_case_memory_no_delete on public.un_case_memory;
create trigger un_case_memory_no_delete before delete on public.un_case_memory
  for each row execute function public.un_case_memory_append_only();
