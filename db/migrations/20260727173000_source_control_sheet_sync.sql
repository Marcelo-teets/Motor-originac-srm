begin;

create table if not exists public.source_control_sheet_sync_runs (
  id uuid primary key default gen_random_uuid(),
  spreadsheet_id text not null,
  sheet_name text not null default 'Página1',
  source_count integer not null check (source_count >= 0),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  status_counts jsonb not null default '{}'::jsonb,
  health_counts jsonb not null default '{}'::jsonb,
  trigger_source text,
  git_sha text,
  workflow_run_id text,
  metadata jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create index if not exists idx_source_control_sheet_sync_runs_synced_at
  on public.source_control_sheet_sync_runs (synced_at desc);

alter table public.source_control_sheet_sync_runs enable row level security;
revoke all on table public.source_control_sheet_sync_runs from public, anon, authenticated;
grant select, insert, update, delete on table public.source_control_sheet_sync_runs to service_role;

drop policy if exists source_control_sheet_sync_runs_service_role_all
  on public.source_control_sheet_sync_runs;
create policy source_control_sheet_sync_runs_service_role_all
  on public.source_control_sheet_sync_runs
  for all to service_role
  using (true)
  with check (true);

create or replace view public.source_control_sheet_v1
with (security_invoker = true)
as
with latest_run as (
  select distinct on (source_id)
    source_id,
    status as last_run_status,
    started_at as last_run_at,
    finished_at as last_run_finished_at,
    items_collected,
    outputs_written,
    signals_written,
    error_message
  from public.source_connector_runs
  where source_id is not null
  order by source_id, started_at desc, id desc
)
select
  sc.id as source_id,
  sc.name,
  sc.url,
  sc.category,
  sc.scope,
  sc.priority,
  sc.criticality,
  sc.frequency,
  sc.status,
  sc.validation_rule,
  sc.source_type,
  sc.auth_requirement,
  sc.health,
  sc.updated_at as source_updated_at,
  lr.last_run_status,
  lr.last_run_at,
  lr.last_run_finished_at,
  coalesce(lr.items_collected, 0) as items_collected,
  coalesce(lr.outputs_written, 0) as outputs_written,
  coalesce(lr.signals_written, 0) as signals_written,
  lr.error_message as last_error_message
from public.source_catalog sc
left join latest_run lr on lr.source_id = sc.id;

revoke all on table public.source_control_sheet_v1 from public, anon, authenticated;
grant select on table public.source_control_sheet_v1 to service_role;

comment on table public.source_control_sheet_sync_runs is
  'Audit trail for every synchronization of the official DCM source-control Google Sheet.';
comment on view public.source_control_sheet_v1 is
  'Service-role-only operational projection used to synchronize source status, health and latest connector telemetry to the official Google Sheet.';

commit;
