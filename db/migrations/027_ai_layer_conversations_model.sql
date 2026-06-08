-- Mirror-only lineage for the live AI conversations model.
--
-- Already applied in Supabase via MCP through lineage including:
--   20260525195947
--   20260605191259 ai_layer_alignment_conversations_model_phase1
--   vector and ai_agent_runs migrations applied in the same live schema track.
--
-- Keep this file for repository parity. Do not use it to re-run production DDL.
-- Statements are intentionally idempotent and qualified to mirror the live shape.

create schema if not exists extensions;
create extension if not exists vector with schema extensions;

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_name text,
  context_type text,
  context_id uuid,
  title text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_conversations_context
  on public.ai_conversations(context_type, context_id, updated_at desc);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null,
  content text not null,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  model text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_messages_conversation_created
  on public.ai_messages(conversation_id, created_at desc);

create table if not exists public.ai_agent_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.ai_conversations(id) on delete cascade,
  context_type text,
  context_id uuid,
  agent_key text,
  plugins jsonb not null default '[]'::jsonb,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_agent_runs_conversation_created
  on public.ai_agent_runs(conversation_id, created_at desc);

create index if not exists idx_ai_agent_runs_agent_created
  on public.ai_agent_runs(agent_key, created_at desc);

create table if not exists public.vector_documents (
  id uuid primary key default gen_random_uuid(),
  company_id text,
  content text not null,
  embedding extensions.vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_vector_documents_company
  on public.vector_documents(company_id);

create index if not exists idx_vector_documents_embedding
  on public.vector_documents using ivfflat (embedding extensions.vector_cosine_ops)
  with (lists = 100);

create or replace function public.match_vector_documents(
  query_embedding extensions.vector(1536),
  match_count integer default 5
)
returns table(id uuid, content text)
language sql
stable
set search_path = public, extensions
as $$
  select vd.id, vd.content
  from public.vector_documents vd
  where vd.embedding is not null
  order by vd.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

comment on table public.ai_conversations is
  'Mirror-only: live AI conversation headers applied via Supabase MCP; replaces legacy ai_sessions.';
comment on table public.ai_messages is
  'Mirror-only: live AI messages use conversation_id, not session_id.';
comment on table public.ai_agent_runs is
  'Mirror-only: live agent run payloads attached to ai_conversations.';
comment on table public.vector_documents is
  'Mirror-only: live vector documents use extensions.vector(1536).';
