-- Pilot reports and the goal-review log. Run after supabase/un-federal.sql.
-- Named un_lifecycle_pilot_reports because un_pilot_reports already exists (the Sijil pilot reports of un-federal.sql, different columns).
-- The code is tested with pure functions (src/lib/un/pilot.ts, pilot-run.ts, goal-judge.ts) and the offline store.

-- One row per pilot run of a job profile, never updated or deleted. A report records the hash of the approved test
-- set and of the approved verdict parameters it ran under (report.test_set_hash, report.params_hash). run_records
-- keeps every run so the report can be recomputed after goal judgments are approved; the recomputed report is a new
-- row whose basis names the pilot and the hash of the approved review.
create table if not exists public.un_lifecycle_pilot_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  use_case_id uuid not null references public.un_use_cases(id) on delete cascade,
  profile text not null,
  at timestamptz not null,
  actor text not null,
  reps int not null,
  runs int not null,
  plan jsonb not null,
  report jsonb not null,
  report_hash text not null,
  run_records jsonb not null default '[]'::jsonb,
  basis jsonb,
  created_at timestamptz not null default now()
);
create index if not exists un_lifecycle_pilot_reports_uc_idx on public.un_lifecycle_pilot_reports (use_case_id, profile, at desc);
alter table public.un_lifecycle_pilot_reports enable row level security;  -- service role only, like the other un_ tables

create or replace function public.un_lifecycle_pilot_reports_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'un_lifecycle_pilot_reports is append-only';
end $$;
drop trigger if exists un_lifecycle_pilot_reports_no_update on public.un_lifecycle_pilot_reports;
create trigger un_lifecycle_pilot_reports_no_update before update on public.un_lifecycle_pilot_reports
  for each row execute function public.un_lifecycle_pilot_reports_append_only();
drop trigger if exists un_lifecycle_pilot_reports_no_delete on public.un_lifecycle_pilot_reports;
create trigger un_lifecycle_pilot_reports_no_delete before delete on public.un_lifecycle_pilot_reports
  for each row execute function public.un_lifecycle_pilot_reports_append_only();

-- Goal alignment: what the model judged, what a person changed, and who approved, as an append-only hash-chained log
-- (same chain as un_tuning_log, see appendEntry in src/lib/un/tuning.ts). One chain per use case and job profile;
-- entries name the pilot they are about (payload.pilot_id).
--   judged     the model's judgment per test and goal (payload.judgments), with the model name
--   approved   a person approved them, with any overrides (each with a reason) and the hash of what was approved
--   withdrawn  an approval taken back, with a reason
create table if not exists public.un_goal_review_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  use_case_id uuid not null references public.un_use_cases(id) on delete cascade,
  profile text not null,
  seq int not null check (seq > 0),
  kind text not null check (kind in ('judged','approved','withdrawn')),
  at timestamptz not null,
  actor text not null,
  payload jsonb not null,
  prev_hash text not null,
  hash text not null,
  created_at timestamptz not null default now(),
  unique (use_case_id, profile, seq)
);
create index if not exists un_goal_review_log_uc_idx on public.un_goal_review_log (use_case_id, profile, seq);
alter table public.un_goal_review_log enable row level security;  -- service role only

create or replace function public.un_goal_review_log_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'un_goal_review_log is append-only';
end $$;
drop trigger if exists un_goal_review_log_no_update on public.un_goal_review_log;
create trigger un_goal_review_log_no_update before update on public.un_goal_review_log
  for each row execute function public.un_goal_review_log_append_only();
drop trigger if exists un_goal_review_log_no_delete on public.un_goal_review_log;
create trigger un_goal_review_log_no_delete before delete on public.un_goal_review_log
  for each row execute function public.un_goal_review_log_append_only();
