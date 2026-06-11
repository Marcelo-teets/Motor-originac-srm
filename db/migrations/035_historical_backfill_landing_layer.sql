-- Aplicada no banco vivo via Supabase MCP em 2026-06-11. Espelho de linhagem — não reexecutar.
-- DO NOT RUN from local migrations. This file documents the live historical landing layer.

begin;

create table if not exists public.bronze_historical_records (
  id uuid primary key default gen_random_uuid(),
  dataset_code text not null,
  record_key text not null,
  ref_date date not null,
  entity_cnpj text,
  payload jsonb not null default '{}'::jsonb,
  source_url text not null,
  content_hash text not null,
  ingested_at timestamptz not null default now(),
  unique (dataset_code, record_key)
);

create table if not exists public.macro_series_observations (
  series_code text not null,
  series_name text not null,
  ref_date date not null,
  value numeric not null,
  unit text not null,
  source text not null,
  ingested_at timestamptz not null default now(),
  unique (series_code, ref_date)
);

create index if not exists bronze_historical_records_dataset_ref_idx
  on public.bronze_historical_records (dataset_code, ref_date desc);

create index if not exists bronze_historical_records_entity_ref_idx
  on public.bronze_historical_records (entity_cnpj, ref_date desc)
  where entity_cnpj is not null;

create index if not exists bronze_historical_records_payload_gin_idx
  on public.bronze_historical_records using gin (payload);

create index if not exists macro_series_observations_series_ref_idx
  on public.macro_series_observations (series_code, ref_date desc);

alter table public.bronze_historical_records enable row level security;
alter table public.macro_series_observations enable row level security;

comment on table public.bronze_historical_records is
  'Landing bronze table for idempotent historical source rows loaded by GitHub Actions backfill jobs.';

comment on table public.macro_series_observations is
  'Normalized macro time-series observations loaded from BCB SGS.';

commit;
