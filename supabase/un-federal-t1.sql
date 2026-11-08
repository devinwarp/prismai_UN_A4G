-- UN T1 additions (plan 13.1, plus D-8 trace table and D-10 entity goals for 13.5).
-- UN-only SQL lives in the un-federal*.sql files so it can be run on main in one go;
-- run this after supabase/un-federal.sql.
-- DRAFT: written by Shaibi on branch t1-fixes. NOT APPLIED. Shameer reviews,
-- takes a backup (Database -> Backups, or pg_dump), then applies it on t1-db.
-- Idempotent where Postgres allows it.
--
-- BEFORE applying: check un_use_cases for rows whose verdict or compliant were
-- set by hand. The dashboard already reads those as unset (guard.ts
-- engineValues), but the trigger below would also reject any later edit that
-- leaves them in place. Either reset them first (uncomment), or re-derive them
-- by running the scenarios and attestations (docs/DB_HANDOVER.md, D-6):
--
--   update public.un_use_cases set verdict = null, compliant = false;
--
-- (The trigger lets a verdict be cleared to null, so this reset also works after it is installed.)

-- ---------------------------------------------------------------------------
-- I-1 / I-4: verdicts and compliance can only come from evidence
-- ---------------------------------------------------------------------------
alter table public.un_use_cases
  add column if not exists verdict_run_id      uuid references public.un_runs(id) on delete set null,
  add column if not exists verdict_head_hash   text,
  add column if not exists verdict_signed_by   uuid references public.profiles(id) on delete set null,  -- I-4
  add column if not exists verdict_signed_at   timestamptz,                                             -- I-4
  add column if not exists compliant_report_id uuid references public.un_pilot_reports(id) on delete set null,
  add column if not exists compliant_report_sha256 text;                                                -- plan I-1: store the report's sha256

-- Guard: the service-role key bypasses RLS, so enforce this with a trigger, not a policy.
create or replace function public.un_guard_verdict() returns trigger language plpgsql as $$
begin
  -- Clearing a verdict (null) is allowed so a re-seed can reset a use case;
  -- setting or changing one needs a signed, completed run.
  if new.verdict is distinct from old.verdict and new.verdict is not null then
    if new.verdict_run_id is null or new.verdict_head_hash is null then
      raise exception 'verdict may only be set from a completed scenario run';
    end if;
    if not exists (select 1 from public.un_runs r
                   where r.id = new.verdict_run_id and r.head_hash = new.verdict_head_hash) then
      raise exception 'verdict_run_id/head_hash do not match a stored run';
    end if;
    if new.verdict_signed_by is null then
      raise exception 'verdict needs a human signature (I-4)';
    end if;
    if new.client_facing and new.verdict = 'GO_AUTONOMOUS' then
      raise exception 'client-facing use cases are capped at GO_SUPERVISED';
    end if;
  end if;
  if new.compliant and not old.compliant then
    if not exists (select 1 from public.un_pilot_reports p
                   where p.id = new.compliant_report_id and p.pass) then
      raise exception 'compliant may only be set from a passing Sijil attestation';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists un_guard_verdict on public.un_use_cases;
create trigger un_guard_verdict before update on public.un_use_cases
  for each row execute function public.un_guard_verdict();

-- ---------------------------------------------------------------------------
-- C4-2 (pulled forward, D-8): append-only trace records
-- One row per hash-chained trace record. The run's head hash is the hash of
-- the row with the highest seq (view below); it is derived, not stored apart.
-- Existing runs keep their jsonb log; only new runs write rows. No backfill.
-- ---------------------------------------------------------------------------
create table if not exists public.un_trace_records (
  run_id     uuid not null references public.un_runs(id) on delete cascade,
  seq        int  not null check (seq > 0),
  record     jsonb not null,
  prev_hash  text  not null,
  hash       text  not null,
  created_at timestamptz not null default now(),
  primary key (run_id, seq),
  unique (run_id, hash)
);
alter table public.un_trace_records enable row level security;  -- service role only, like the other un_ tables

create or replace function public.un_trace_append_only() returns trigger language plpgsql as $$
begin
  -- A cascade from deleting the run itself is allowed (the parent row is already gone);
  -- any direct UPDATE or DELETE is not.
  if tg_op = 'DELETE' and not exists (select 1 from public.un_runs r where r.id = old.run_id) then
    return old;
  end if;
  raise exception 'un_trace_records is append-only (% rejected)', tg_op;
end $$;

drop trigger if exists un_trace_no_update on public.un_trace_records;
create trigger un_trace_no_update before update on public.un_trace_records
  for each row execute function public.un_trace_append_only();
drop trigger if exists un_trace_no_delete on public.un_trace_records;
create trigger un_trace_no_delete before delete on public.un_trace_records
  for each row execute function public.un_trace_append_only();
-- TRUNCATE is not row-level; block it too.
create or replace function public.un_trace_no_truncate() returns trigger language plpgsql as $$
begin raise exception 'un_trace_records is append-only (TRUNCATE rejected)'; end $$;
drop trigger if exists un_trace_no_truncate on public.un_trace_records;
create trigger un_trace_no_truncate before truncate on public.un_trace_records
  for each statement execute function public.un_trace_no_truncate();

create or replace view public.un_trace_heads as
  select distinct on (run_id) run_id, seq as length, hash as head_hash
  from public.un_trace_records
  order by run_id, seq desc;

-- ---------------------------------------------------------------------------
-- C2-10 (pulled forward, D-10): entity goals. Seeded, not editable in the UI.
-- Seed: supabase/seed-entities.sql (run after this migration).
-- ---------------------------------------------------------------------------
create table if not exists public.un_entities (
  org_id uuid not null references public.organizations(id) on delete cascade,
  name   text not null,
  sector text,
  goals  jsonb not null default '[]',
  primary key (org_id, name)
);
alter table public.un_entities enable row level security;
