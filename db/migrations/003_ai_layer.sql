-- AI layer for copilot query, feedback and vector retrieval
create extension if not exists vector;

create table if not exists ai_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  company_id text references companies(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_sessions_company_created on ai_sessions(company_id, created_at desc);

create table if not exists ai_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references ai_sessions(id) on delete cascade,
  role text not null check (role in ('system', 'assistant', 'analyst', 'user')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_messages_session_created on ai_messages(session_id, created_at desc);

create table if not exists ai_agent_runs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references ai_sessions(id) on delete cascade,
  company_id text references companies(id),
  plugins jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_agent_runs_session_created on ai_agent_runs(session_id, created_at desc);

create table if not exists vector_documents (
  id uuid primary key,
  company_id text references companies(id),
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
create index if not exists idx_vector_documents_company on vector_documents(company_id);

create or replace function match_vector_documents(
  query_embedding vector(1536),
  match_count integer default 5
)
returns table(id uuid, content text)
language sql
as $$
  select vd.id, vd.content
  from vector_documents vd
  where vd.embedding is not null
  order by vd.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
