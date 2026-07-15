-- Incremental checkpoints and exact write metrics for CVM capital-market ingestion.

alter table public.capital_market_events
  add column if not exists content_hash text;

update public.capital_market_events
set content_hash = encode(digest(raw_payload::text, 'sha256'), 'hex')
where content_hash is null;

alter table public.capital_market_dataset_runs
  add column if not exists resources_skipped integer not null default 0,
  add column if not exists records_inserted integer not null default 0,
  add column if not exists records_updated integer not null default 0,
  add column if not exists records_unchanged integer not null default 0;

create table if not exists public.capital_market_resource_checkpoints (
  id uuid primary key default gen_random_uuid(),
  dataset_code text not null,
  source_id uuid references public.source_catalog(id) on delete set null,
  resource_key text not null,
  resource_name text not null,
  resource_url text not null,
  resource_modified_at timestamptz,
  content_hash text,
  status text not null default 'completed',
  last_successful_run_at timestamptz,
  last_checked_at timestamptz not null default now(),
  records_seen integer not null default 0,
  records_written integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint capital_market_resource_checkpoints_unique unique(dataset_code, resource_key),
  constraint capital_market_resource_checkpoints_status_check
    check (status in ('completed', 'partial', 'failed'))
);

create index if not exists idx_capital_market_resource_checkpoints_dataset_checked
  on public.capital_market_resource_checkpoints(dataset_code, last_checked_at desc);

create index if not exists idx_capital_market_resource_checkpoints_source
  on public.capital_market_resource_checkpoints(source_id)
  where source_id is not null;

alter table public.capital_market_resource_checkpoints enable row level security;

drop policy if exists service_role_all_capital_market_resource_checkpoints
  on public.capital_market_resource_checkpoints;
create policy service_role_all_capital_market_resource_checkpoints
  on public.capital_market_resource_checkpoints
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists authenticated_select_capital_market_resource_checkpoints
  on public.capital_market_resource_checkpoints;
create policy authenticated_select_capital_market_resource_checkpoints
  on public.capital_market_resource_checkpoints
  for select
  to authenticated
  using (true);

grant all on public.capital_market_resource_checkpoints to service_role;
grant select on public.capital_market_resource_checkpoints to authenticated;

comment on table public.capital_market_resource_checkpoints is
  'Checkpoint incremental por recurso oficial da CVM, usado para evitar downloads e upserts repetidos sem mudança material.';
