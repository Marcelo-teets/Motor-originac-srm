begin;

create index if not exists idx_capital_market_events_archive_payload_due
  on public.capital_market_events (observed_at, id)
  where raw_payload <> '{}'::jsonb
     or normalized_payload <> '{}'::jsonb;

create index if not exists idx_source_documents_archive_payload_due
  on public.source_documents (observed_at, id)
  where raw_payload <> '{}'::jsonb
     or normalized_payload <> '{}'::jsonb;

create index if not exists idx_monitoring_outputs_archive_payload_due
  on public.monitoring_outputs (observed_at, id)
  where raw_text is not null
     or payload <> '{}'::jsonb
     or output_payload <> '{}'::jsonb
     or normalized_payload <> '{}'::jsonb;

analyze public.capital_market_events;
analyze public.source_documents;
analyze public.monitoring_outputs;

commit;
