-- Targeted public bulk ingestion for official Brazilian datasets.
-- Only records matching Company Master CNPJs are persisted.

create extension if not exists pgcrypto;

create table if not exists public.public_dataset_runs (
  id uuid primary key default gen_random_uuid(),
  dataset_code text not null,
  source_id uuid references public.source_catalog(id) on delete set null,
  trigger_type text not null default 'manual',
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  resources_discovered integer not null default 0,
  resources_processed integer not null default 0,
  resources_skipped integer not null default 0,
  rows_scanned bigint not null default 0,
  records_matched integer not null default 0,
  bronze_rows_written integer not null default 0,
  normalized_rows_written integer not null default 0,
  outputs_written integer not null default 0,
  signals_written integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_dataset_runs_status_check check (status in ('running','completed','partial','failed'))
);

create unique index if not exists uq_public_dataset_single_running
  on public.public_dataset_runs(dataset_code) where status = 'running';
create index if not exists idx_public_dataset_runs_started
  on public.public_dataset_runs(dataset_code, started_at desc);

create table if not exists public.public_dataset_resource_checkpoints (
  id uuid primary key default gen_random_uuid(),
  dataset_code text not null,
  source_id uuid references public.source_catalog(id) on delete set null,
  resource_key text not null,
  resource_name text not null,
  resource_url text not null,
  resource_modified_at text,
  etag text,
  content_hash text,
  status text not null,
  last_successful_run_at timestamptz,
  last_checked_at timestamptz not null default now(),
  rows_scanned bigint not null default 0,
  records_matched integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_dataset_checkpoint_unique unique(dataset_code, resource_key),
  constraint public_dataset_checkpoint_status_check check (status in ('completed','partial','failed'))
);
create index if not exists idx_public_dataset_checkpoints_status
  on public.public_dataset_resource_checkpoints(dataset_code, status, last_checked_at desc);

create table if not exists public.public_company_records (
  id uuid primary key default gen_random_uuid(),
  dataset_code text not null,
  source_code text not null,
  record_key text not null,
  company_id uuid references public.companies(id) on delete set null,
  entity_cnpj text not null,
  entity_name text,
  record_type text not null,
  reference_date date,
  amount numeric,
  status text,
  source_url text not null,
  resource_key text not null,
  content_hash text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_company_records_unique unique(dataset_code, record_key)
);
create index if not exists idx_public_company_records_cnpj
  on public.public_company_records(entity_cnpj, reference_date desc);
create index if not exists idx_public_company_records_company
  on public.public_company_records(company_id, reference_date desc) where company_id is not null;
create index if not exists idx_public_company_records_type
  on public.public_company_records(record_type, reference_date desc);

alter table public.public_dataset_runs enable row level security;
alter table public.public_dataset_resource_checkpoints enable row level security;
alter table public.public_company_records enable row level security;

drop policy if exists service_role_all_public_dataset_runs on public.public_dataset_runs;
create policy service_role_all_public_dataset_runs on public.public_dataset_runs
  for all to service_role using (true) with check (true);
drop policy if exists authenticated_select_public_dataset_runs on public.public_dataset_runs;
create policy authenticated_select_public_dataset_runs on public.public_dataset_runs
  for select to authenticated using (true);

drop policy if exists service_role_all_public_dataset_checkpoints on public.public_dataset_resource_checkpoints;
create policy service_role_all_public_dataset_checkpoints on public.public_dataset_resource_checkpoints
  for all to service_role using (true) with check (true);
drop policy if exists authenticated_select_public_dataset_checkpoints on public.public_dataset_resource_checkpoints;
create policy authenticated_select_public_dataset_checkpoints on public.public_dataset_resource_checkpoints
  for select to authenticated using (true);

drop policy if exists service_role_all_public_company_records on public.public_company_records;
create policy service_role_all_public_company_records on public.public_company_records
  for all to service_role using (true) with check (true);
drop policy if exists authenticated_select_public_company_records on public.public_company_records;
create policy authenticated_select_public_company_records on public.public_company_records
  for select to authenticated using (true);

grant all on public.public_dataset_runs to service_role;
grant all on public.public_dataset_resource_checkpoints to service_role;
grant all on public.public_company_records to service_role;
grant select on public.public_dataset_runs to authenticated;
grant select on public.public_dataset_resource_checkpoints to authenticated;
grant select on public.public_company_records to authenticated;

create unique index if not exists uq_monitoring_outputs_public_record
  on public.monitoring_outputs(company_id, source_id, ((payload ->> 'publicRecordKey')))
  where payload ? 'publicRecordKey';
create unique index if not exists uq_company_signals_public_record
  on public.company_signals(company_id, signal_type, ((metadata ->> 'publicRecordKey')))
  where metadata ? 'publicRecordKey';
