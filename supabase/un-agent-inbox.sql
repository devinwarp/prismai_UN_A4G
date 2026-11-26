-- The agents' inbox, the RACI overrides, each user's agent settings, and the agents' action log.
-- Run after supabase/un-roles.sql (and un-scoped-roles.sql). NOT APPLIED to any database: Shameer applies it. Additive: no existing table or row is touched.
--
-- un_inbox_items       one row per thing a person (or their agent) has to deal with. mode: action | approval | consult | inform. handler: agent | human.
--                      status: open | agent_working | done | blocked_human | dismissed. An explicit decision (an approval or a signature) is always handler 'human'.
--                      An agent that is refused, or fails three times, hands the item to the person: handler 'human', status 'blocked_human', blocked_reason says why.
--                      One open item per (user, dedupe_key). An unanswered human item escalates after two working days (escalate_at, then escalated_at).
-- un_raci_overrides    a person's RACI letter for one step, on one use case or one entity, replacing the default derived from their role.
-- un_agent_settings    a user's agent: switched on or off (the kill switch), and the daily cap on its actions. Sign-off actions are never taken by an agent.
-- un_agent_log         append-only, hash-chained per user: what an agent did for a person, or was refused.
create table if not exists public.un_inbox_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  kind text not null,
  mode text not null check (mode in ('action','approval','consult','inform')),
  letter text not null check (letter in ('R','A','C','I','AR')),
  handler text not null check (handler in ('agent','human')),
  status text not null default 'open' check (status in ('open','agent_working','done','blocked_human','dismissed')),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null,
  body text not null default '',
  entity text,
  country text,
  use_case_id uuid references public.un_use_cases(id) on delete cascade,
  link text,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  attempts int not null default 0,
  blocked_reason text,
  escalate_at timestamptz,
  escalated_at timestamptz,
  escalated_from text,
  read_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  created_by text not null default 'system'
);
create unique index if not exists un_inbox_items_one_open_idx on public.un_inbox_items (org_id, user_id, dedupe_key) where status in ('open','agent_working','blocked_human');
create index if not exists un_inbox_items_user_idx on public.un_inbox_items (org_id, user_id, status);
alter table public.un_inbox_items enable row level security;  -- service role only, like the other un_ tables

create table if not exists public.un_raci_overrides (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  step text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  letter text not null check (letter in ('R','A','C','I','AR')),
  entity text,
  use_case_id uuid references public.un_use_cases(id) on delete cascade,
  set_by uuid references public.profiles(id),
  set_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists un_raci_overrides_user_idx on public.un_raci_overrides (org_id, user_id) where revoked_at is null;
alter table public.un_raci_overrides enable row level security;

create table if not exists public.un_agent_settings (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  enabled boolean not null default true,
  daily_cap int not null default 50 check (daily_cap >= 0),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
alter table public.un_agent_settings enable row level security;

create table if not exists public.un_agent_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  seq int not null,
  at timestamptz not null default now(),
  item_id uuid,
  action text not null,
  outcome text not null check (outcome in ('done','blocked','skipped')),
  detail jsonb not null default '{}'::jsonb,
  prev_hash text,
  hash text not null,
  unique (org_id, user_id, seq)
);
alter table public.un_agent_log enable row level security;
