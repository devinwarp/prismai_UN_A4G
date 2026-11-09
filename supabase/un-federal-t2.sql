-- UN T2: tamper-evident change history for the tables a judge would ask about.
-- Run after supabase/un-federal.sql and supabase/un-federal-t1.sql. Idempotent.
-- Every INSERT, UPDATE or DELETE on un_use_cases, un_policy and un_hitl_rules writes one row
-- holding the old and new value of each changed column (updated_at is ignored). Rows are
-- append-only and hash-chained: hash = sha256(prev_hash || canonical text of the record),
-- so editing, deleting, inserting or reordering a row breaks un_verify_change_log().
-- Limit: the actor is the database role (the app uses the service role), not the person;
-- who signed a verdict is on the use case (verdict_signed_by) and in the run trace.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.un_change_log (
  seq        bigserial primary key,
  at         text   not null,            -- UTC, fixed format, part of the hash
  table_name text   not null,
  row_id     text   not null,
  op         text   not null check (op in ('INSERT','UPDATE','DELETE')),
  changes    jsonb  not null,            -- { column: { from, to } }
  actor      text   not null,
  prev_hash  text   not null,
  hash       text   not null unique
);
alter table public.un_change_log enable row level security;  -- service role only, like the other un_ tables

create or replace function public.un_change_record(p_at text, p_table text, p_row text, p_op text, p_changes jsonb, p_actor text)
returns text language sql immutable as $$
  select jsonb_build_object('at', p_at, 'table', p_table, 'row_id', p_row, 'op', p_op, 'changes', p_changes, 'actor', p_actor)::text
$$;

create or replace function public.un_log_change() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  o jsonb := '{}'; n jsonb := '{}'; diff jsonb := '{}'; k text; prev text; at_txt text; rid text; act text; h text;
begin
  if tg_op in ('UPDATE','DELETE') then o := to_jsonb(old); end if;
  if tg_op in ('INSERT','UPDATE') then n := to_jsonb(new); end if;
  for k in select jsonb_object_keys(o || n) loop
    continue when k = 'updated_at';
    if (o -> k) is distinct from (n -> k) then
      diff := diff || jsonb_build_object(k, jsonb_build_object('from', o -> k, 'to', n -> k));
    end if;
  end loop;
  if diff = '{}'::jsonb then return null; end if;
  rid := coalesce((n ->> 'id'), (o ->> 'id'), (n ->> 'org_id'), (o ->> 'org_id'));
  if tg_table_name = 'un_use_cases' then rid := coalesce(n ->> 'ext_id', o ->> 'ext_id') || ' (' || rid || ')'; end if;
  if tg_table_name = 'un_hitl_rules' then rid := coalesce(n ->> 'entity', o ->> 'entity') || '/' || coalesce(n ->> 'rule', o ->> 'rule'); end if;
  act := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user);
  at_txt := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
  perform pg_advisory_xact_lock(7203001);
  select c.hash into prev from public.un_change_log c order by c.seq desc limit 1;
  prev := coalesce(prev, repeat('0', 64));
  h := encode(digest(prev || public.un_change_record(at_txt, tg_table_name, rid, tg_op, diff, act), 'sha256'), 'hex');
  insert into public.un_change_log (at, table_name, row_id, op, changes, actor, prev_hash, hash)
  values (at_txt, tg_table_name, rid, tg_op, diff, act, prev, h);
  return null;
end $$;

do $$ declare t text; begin
  foreach t in array array['un_use_cases','un_policy','un_hitl_rules'] loop
    execute format('drop trigger if exists un_log_change on public.%I', t);
    execute format('create trigger un_log_change after insert or update or delete on public.%I for each row execute function public.un_log_change()', t);
  end loop;
end $$;

create or replace function public.un_change_log_append_only() returns trigger language plpgsql as $$
begin raise exception 'un_change_log is append-only (% rejected)', tg_op; end $$;
drop trigger if exists un_change_log_no_update on public.un_change_log;
create trigger un_change_log_no_update before update or delete on public.un_change_log
  for each row execute function public.un_change_log_append_only();
drop trigger if exists un_change_log_no_truncate on public.un_change_log;
create trigger un_change_log_no_truncate before truncate on public.un_change_log
  for each statement execute function public.un_change_log_append_only();

-- Recompute the whole chain. ok = true, or the first broken seq and why.
create or replace function public.un_verify_change_log()
returns table (ok boolean, length bigint, broken_seq bigint, reason text)
language plpgsql security definer set search_path = public, extensions as $$
declare r record; prev text := repeat('0', 64); n bigint := 0;
begin
  for r in select * from public.un_change_log order by seq loop
    n := n + 1;
    if r.prev_hash <> prev then return query select false, n, r.seq, 'prev_hash does not match the previous row (row deleted, inserted or reordered)'; return; end if;
    if r.hash <> encode(digest(prev || public.un_change_record(r.at, r.table_name, r.row_id, r.op, r.changes, r.actor), 'sha256'), 'hex')
      then return query select false, n, r.seq, 'row content does not match its hash (edited)'; return; end if;
    prev := r.hash;
  end loop;
  return query select true, n, null::bigint, null::text;
end $$;
