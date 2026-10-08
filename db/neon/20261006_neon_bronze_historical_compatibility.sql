-- Canonical Neon bronze landing layer for historical/public connector payloads.

create table if not exists public.bronze_historical_records (
  id uuid primary key default gen_random_uuid(),
  dataset_code text not null,
  record_key text not null,
  ref_date date,
  entity_cnpj text,
  payload jsonb not null default '{}'::jsonb,
  source_url text,
  source_file_name text,
  content_hash text,
  source_document_id text,
  run_id uuid,
  captured_at timestamptz not null default now(),
  ingested_at timestamptz not null default now(),
  observed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(dataset_code, record_key)
);

create index if not exists idx_bronze_historical_dataset_ref
  on public.bronze_historical_records(dataset_code, ref_date desc);
create index if not exists idx_bronze_historical_entity
  on public.bronze_historical_records(entity_cnpj)
  where entity_cnpj is not null;
create index if not exists idx_bronze_historical_hash
  on public.bronze_historical_records(content_hash)
  where content_hash is not null;

-- CREATE TABLE IF NOT EXISTS does not add columns to an existing baseline.
alter table public.bronze_historical_records
  add column if not exists ingested_at timestamptz;
update public.bronze_historical_records
set ingested_at = coalesce(ingested_at, captured_at, created_at, now())
where ingested_at is null;
alter table public.bronze_historical_records
  alter column ingested_at set default now(),
  alter column ingested_at set not null;
create index if not exists idx_bronze_historical_records_dataset_ingested
  on public.bronze_historical_records(dataset_code, ingested_at);

alter table public.bronze_historical_records enable row level security;
revoke all on table public.bronze_historical_records from public, anon, authenticated;
grant all on table public.bronze_historical_records to service_role;
drop policy if exists bronze_historical_records_service_role_all on public.bronze_historical_records;
create policy bronze_historical_records_service_role_all
  on public.bronze_historical_records for all to service_role using (true) with check (true);
