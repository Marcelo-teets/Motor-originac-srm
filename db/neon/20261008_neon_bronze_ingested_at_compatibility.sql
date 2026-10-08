-- Restore the canonical ingestion timestamp required by public-data and capital-market writers.
-- Existing Neon baseline rows are backfilled from captured_at/created_at; new rows default to now().

alter table public.bronze_historical_records
  add column if not exists ingested_at timestamptz;

update public.bronze_historical_records
set ingested_at = coalesce(ingested_at, captured_at, created_at, now())
where ingested_at is null;

alter table public.bronze_historical_records
  alter column ingested_at set default now();

alter table public.bronze_historical_records
  alter column ingested_at set not null;

create index if not exists idx_bronze_historical_records_dataset_ingested
  on public.bronze_historical_records (dataset_code, ingested_at);

create index if not exists idx_bronze_historical_records_ingested_at_brin
  on public.bronze_historical_records using brin (ingested_at)
  with (pages_per_range = 64);
