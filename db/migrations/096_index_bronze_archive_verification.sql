create index if not exists idx_bronze_historical_records_dataset_ingested
  on public.bronze_historical_records (dataset_code, ingested_at);
