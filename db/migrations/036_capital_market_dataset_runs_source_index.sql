-- Cover the source_catalog foreign key used by capital-market ingestion run audits.
create index if not exists idx_capital_market_dataset_runs_source_id
  on public.capital_market_dataset_runs(source_id)
  where source_id is not null;
