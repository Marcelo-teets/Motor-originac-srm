-- Microsoft Planner + To Do integration
-- Source of truth: Microsoft Graph. Supabase stores encrypted connection state,
-- external links and an auditable synchronization ledger.

create table if not exists public.microsoft_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'error', 'disconnected')),
  tenant_id text,
  microsoft_user_id text,
  account_email text,
  display_name text,
  granted_scopes text[] not null default '{}',
  access_token_encrypted text,
  refresh_token_encrypted text not null,
  access_token_expires_at timestamptz,
  todo_list_id text,
  planner_plan_id text,
  planner_group_id text,
  planner_bucket_ids jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.microsoft_task_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('todo', 'planner')),
  local_task_id text,
  external_task_id text not null,
  external_container_id text not null,
  external_etag text,
  title text,
  status text,
  due_at timestamptz,
  content_hash text,
  sync_direction text not null default 'bidirectional' check (sync_direction in ('bidirectional', 'microsoft_to_local', 'local_to_microsoft')),
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, external_task_id),
  unique nulls not distinct (user_id, provider, local_task_id)
);

create table if not exists public.microsoft_sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  trigger_type text not null check (trigger_type in ('manual', 'cron', 'bootstrap')),
  status text not null check (status in ('running', 'completed', 'partial', 'failed')),
  todo_items_read integer not null default 0,
  planner_items_read integer not null default 0,
  local_items_written integer not null default 0,
  external_items_written integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists microsoft_task_links_user_provider_idx
  on public.microsoft_task_links (user_id, provider, last_synced_at desc);
create index if not exists microsoft_sync_runs_user_created_idx
  on public.microsoft_sync_runs (user_id, created_at desc);

alter table public.microsoft_connections enable row level security;
alter table public.microsoft_task_links enable row level security;
alter table public.microsoft_sync_runs enable row level security;

-- These tables are backend-only. The service role is used by the serverless
-- integration; anon/authenticated clients receive no direct table privileges.
revoke all on table public.microsoft_connections from anon, authenticated;
revoke all on table public.microsoft_task_links from anon, authenticated;
revoke all on table public.microsoft_sync_runs from anon, authenticated;
grant select, insert, update, delete on table public.microsoft_connections to service_role;
grant select, insert, update, delete on table public.microsoft_task_links to service_role;
grant select, insert, update, delete on table public.microsoft_sync_runs to service_role;
