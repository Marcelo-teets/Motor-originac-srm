-- Aplicada no banco vivo via Supabase MCP em 2026-06-11. Espelho de linhagem — não reexecutar.
-- DO NOT RUN from local migrations. This file documents the live capture persistence stabilization.

begin;

create table if not exists public.capture_runs (
  id text primary key,
  source_id text references public.source_catalog(id) on delete set null,
  capture_type text not null default 'daily',
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'partial')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.capture_run_records (
  id bigserial primary key,
  run_id text not null references public.capture_runs(id) on delete cascade,
  record_type text not null,
  record_key text not null,
  payload jsonb not null default '{}'::jsonb,
  content_hash text,
  created_at timestamptz not null default now(),
  unique (run_id, record_type, record_key)
);

alter table public.monitoring_outputs
  add column if not exists capture_run_id text references public.capture_runs(id) on delete set null;

alter table public.company_signals
  add column if not exists capture_run_id text references public.capture_runs(id) on delete set null;

create index if not exists capture_runs_source_started_idx
  on public.capture_runs (source_id, started_at desc);

create index if not exists capture_runs_status_started_idx
  on public.capture_runs (status, started_at desc);

create index if not exists capture_run_records_run_type_idx
  on public.capture_run_records (run_id, record_type);

create index if not exists capture_run_records_content_hash_idx
  on public.capture_run_records (content_hash)
  where content_hash is not null;

create index if not exists monitoring_outputs_capture_run_idx
  on public.monitoring_outputs (capture_run_id)
  where capture_run_id is not null;

create index if not exists company_signals_capture_run_idx
  on public.company_signals (capture_run_id)
  where capture_run_id is not null;

alter table public.capture_runs enable row level security;
alter table public.capture_run_records enable row level security;

commit;
