-- Database guards for the lifecycle logs. Run after un-agent-lifecycle.sql and un-gates.sql. New file; schema.sql is untouched.
-- The hash chain already makes an edited row detectable in the app; these triggers also stop the edit at the database.
--   un_gate_log        no UPDATE, no DELETE (nothing in the app does either; changes are new entries).
--   un_tuning_log      no UPDATE. DELETE stays allowed ONLY because the admin-only demo reset (resetTuning in
--   un_watchdog_log    src/lib/un/tuning-store.ts and the watchdog route) clears a use case's log between demo runs.
--   un_eval_runs       So these three are append-only in normal use, and resettable by an admin, not tamper-proof against deletion.
create or replace function public.un_log_no_update() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only: rows are never updated', tg_table_name;
end $$;
create or replace function public.un_log_no_delete() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only: rows are never deleted', tg_table_name;
end $$;

drop trigger if exists un_gate_log_no_update on public.un_gate_log;
create trigger un_gate_log_no_update before update on public.un_gate_log for each row execute function public.un_log_no_update();
drop trigger if exists un_gate_log_no_delete on public.un_gate_log;
create trigger un_gate_log_no_delete before delete on public.un_gate_log for each row execute function public.un_log_no_delete();

drop trigger if exists un_tuning_log_no_update on public.un_tuning_log;
create trigger un_tuning_log_no_update before update on public.un_tuning_log for each row execute function public.un_log_no_update();
drop trigger if exists un_watchdog_log_no_update on public.un_watchdog_log;
create trigger un_watchdog_log_no_update before update on public.un_watchdog_log for each row execute function public.un_log_no_update();
drop trigger if exists un_eval_runs_no_update on public.un_eval_runs;
create trigger un_eval_runs_no_update before update on public.un_eval_runs for each row execute function public.un_log_no_update();
