alter table if exists public.source_connector_runs
  add column if not exists error_message text;

alter table if exists public.source_connector_runs
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_source_connector_runs_scope_trigger
  on public.source_connector_runs(scope_type, trigger_type, started_at desc);

create index if not exists idx_source_connector_runs_status
  on public.source_connector_runs(status, started_at desc);

create index if not exists idx_source_connector_runs_metadata_source_code
  on public.source_connector_runs((metadata->>'sourceCode'), started_at desc);
