-- Aplicada no banco vivo via Supabase MCP em 2026-06-11. Espelho de linhagem — não reexecutar.
create table if not exists public.bronze_historical_records (
  id uuid primary key default gen_random_uuid(),
  dataset_code text not null,
  record_key text not null,
  ref_date date,
  entity_cnpj text,
  payload jsonb not null default '{}'::jsonb,
  source_url text,
  content_hash text,
  ingested_at timestamptz not null default now(),
  unique (dataset_code, record_key)
);

create index if not exists idx_bhr_dataset_refdate on public.bronze_historical_records(dataset_code, ref_date desc);
create index if not exists idx_bhr_cnpj on public.bronze_historical_records(entity_cnpj) where entity_cnpj is not null;

create table if not exists public.macro_series_observations (
  id uuid primary key default gen_random_uuid(),
  series_code text not null,
  series_name text,
  ref_date date not null,
  value numeric not null,
  unit text,
  source text not null default 'bcb_sgs',
  ingested_at timestamptz not null default now(),
  unique (series_code, ref_date)
);

create index if not exists idx_mso_series_date on public.macro_series_observations(series_code, ref_date desc);

alter table public.bronze_historical_records enable row level security;
alter table public.macro_series_observations enable row level security;
create policy srv_all_bronze_historical_records on public.bronze_historical_records as permissive for all to service_role using (true) with check (true);
create policy srv_all_macro_series_observations on public.macro_series_observations as permissive for all to service_role using (true) with check (true);
create policy authenticated_select_bronze_historical_records on public.bronze_historical_records as permissive for select to authenticated using (true);
create policy authenticated_select_macro_series_observations on public.macro_series_observations as permissive for select to authenticated using (true);

comment on table public.bronze_historical_records is 'Bronze landing for historical backfills (CVM FIDC/SECURIT/OFERTAS, CNPJ bulk, gazettes). Dedup by (dataset_code, record_key).';
comment on table public.macro_series_observations is 'Typed macro credit time series (BCB SGS) feeding predictive model features.';
