-- Country and knowledge base: the hash-chained country log and the blobs a live build produces.
-- Run after supabase/un-federal.sql and supabase/un-log-guards.sql. NEW file; schema.sql is untouched.
-- WRITTEN, NOT APPLIED to any database. The code that uses it (src/lib/un/country-store.ts) is tested against the offline
-- stand-in and a strict mock of the supabase-js query shape, not against Supabase.
--
-- un_country_log   one append-only, hash-chained log per organisation (same chain as un_gate_log, appendEntry in
--                  src/lib/un/tuning.ts). Everything is replayed from it (replayCountry in src/lib/un/country.ts):
--                    switch             the active country changed (payload.from, payload.to, payload.company)
--                    policy_added       a country scope was built live from staged policy files (counts, timings, hashes)
--                    company_onboarded  a synthetic company and its own SOP were added (analysis, profiles, counts)
--                    run                the staged process was re-run under a country's rule set and sources (the full result)
--                    reset              the demo was returned to its starting state (the log is never shortened)
-- un_country_blobs  derived data that does not belong in the log: the vectors of a live-built scope ("vectors:<COUNTRY>")
--                  and a company's SOP chunks ("sop:<id>"). A reset deletes only the keys this feature wrote.
create table if not exists public.un_country_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  seq int not null check (seq > 0),
  kind text not null,
  at timestamptz not null,
  actor text not null,
  payload jsonb not null,
  prev_hash text not null,
  hash text not null,
  created_at timestamptz not null default now(),
  unique (org_id, seq)
);
create index if not exists un_country_log_org_idx on public.un_country_log (org_id, seq);
alter table public.un_country_log enable row level security;  -- service role only, like the other un_ tables

create table if not exists public.un_country_blobs (
  org_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  body jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (org_id, key)
);
alter table public.un_country_blobs enable row level security;

-- Append-only at the database too (same functions as supabase/un-log-guards.sql, redefined so this file stands alone).
create or replace function public.un_log_no_update() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only: rows are never updated', tg_table_name;
end $$;
create or replace function public.un_log_no_delete() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only: rows are never deleted', tg_table_name;
end $$;
drop trigger if exists un_country_log_no_update on public.un_country_log;
create trigger un_country_log_no_update before update on public.un_country_log for each row execute function public.un_log_no_update();
drop trigger if exists un_country_log_no_delete on public.un_country_log;
create trigger un_country_log_no_delete before delete on public.un_country_log for each row execute function public.un_log_no_delete();
