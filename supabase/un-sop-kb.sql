-- SOP knowledge base and tuning storage. Run after supabase/un-federal.sql. NEW file: schema.sql is untouched.
-- WRITTEN, NOT APPLIED to any database, and not tested against Supabase. The code that uses it
-- (src/lib/un/kb-store-supabase.ts) is unit-tested only against a mocked client; the app's default is the
-- file store in src/lib/un/kb-store.ts. Everything stored is synthetic. The outside-request queue is a
-- separate table owned by another workstream and is deliberately not created here.
-- Embeddings are 768-dimensional (nomic-embed-text-v1.5, as scripts/build_sop_kb.ts); see docs/sop-kb-hosting.md.
create extension if not exists vector;

create table if not exists public.un_sops (
  org_id uuid not null references public.organizations(id) on delete cascade,
  sop_id text not null,
  title text not null,
  version text not null,
  issuer text not null,
  source_path text not null,
  source_sha256 text not null,
  synthetic boolean not null default true check (synthetic),
  updated_at timestamptz not null default now(),
  primary key (org_id, sop_id)
);

create table if not exists public.un_sop_chunks (
  org_id uuid not null references public.organizations(id) on delete cascade,
  sop_id text not null,
  chunk_id text not null,
  text text not null,
  sha256 text not null,            -- of the text, so a stale vector can be told from a current one
  topics text[] not null default '{}',
  meta jsonb not null default '{}',
  embedding vector(768),           -- null until embedded
  primary key (org_id, chunk_id),
  foreign key (org_id, sop_id) references public.un_sops(org_id, sop_id) on delete cascade
);
create index if not exists un_sop_chunks_sop_idx on public.un_sop_chunks (org_id, sop_id);
create index if not exists un_sop_chunks_vec_idx on public.un_sop_chunks using hnsw (embedding vector_cosine_ops);

-- Nearest chunks of one SOP to a query embedding (the hosted counterpart of the file search).
create or replace function public.un_match_sop_chunks(p_org uuid, p_sop text, p_query vector(768), p_k int default 5)
returns table (chunk_id text, text text, topics text[], similarity float8)
language sql stable as $$
  select c.chunk_id, c.text, c.topics, 1 - (c.embedding <=> p_query) as similarity
  from public.un_sop_chunks c
  where c.org_id = p_org and c.sop_id = p_sop and c.embedding is not null
  order by c.embedding <=> p_query
  limit greatest(1, least(p_k, 50));
$$;

-- Versions of the glossary/routing/threshold settings ("retrieval") and of each job profile's tuned rule lines
-- ("skill:<profile>"). The hash-chained log below is the record; this table is the queryable copy.
create table if not exists public.un_kb_configs (
  org_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,                -- '<target>@v<n>'
  target text not null,
  version int not null check (version > 0),
  status text not null check (status in ('proposed','approved','rejected')),
  value jsonb not null,
  summary text not null default '',
  created_by text not null,
  created_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz,
  primary key (org_id, id)
);

create table if not exists public.un_kb_questions (
  org_id uuid not null references public.organizations(id) on delete cascade,
  sop_id text not null,
  id text not null,
  question text not null,
  expect jsonb not null,           -- {"chunks":["SOP-...#D4"]} or {"outside":true}
  split text not null check (split in ('tune','holdout')),
  primary key (org_id, sop_id, id)
);

create table if not exists public.un_kb_runs (
  org_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  sop_id text not null,
  kind text not null check (kind in ('questions','tasks')),
  config_version int not null,
  at timestamptz not null,
  actor text not null,
  summary jsonb not null,
  results jsonb not null,
  primary key (org_id, id)
);

create table if not exists public.un_kb_log (
  org_id uuid not null references public.organizations(id) on delete cascade,
  seq int not null check (seq > 0),
  kind text not null check (kind in ('proposed','approved','rejected','bank_edit')),
  at timestamptz not null,
  actor text not null,
  payload jsonb not null,
  prev_hash text not null,
  hash text not null,
  primary key (org_id, seq)
);

alter table public.un_sops enable row level security;          -- service role only, like the other un_ tables
alter table public.un_sop_chunks enable row level security;
alter table public.un_kb_configs enable row level security;
alter table public.un_kb_questions enable row level security;
alter table public.un_kb_runs enable row level security;
alter table public.un_kb_log enable row level security;

create or replace function public.un_kb_log_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'un_kb_log is append-only';
end $$;
drop trigger if exists un_kb_log_no_update on public.un_kb_log;
create trigger un_kb_log_no_update before update on public.un_kb_log for each row execute function public.un_kb_log_append_only();
drop trigger if exists un_kb_log_no_delete on public.un_kb_log;
create trigger un_kb_log_no_delete before delete on public.un_kb_log for each row execute function public.un_kb_log_append_only();
