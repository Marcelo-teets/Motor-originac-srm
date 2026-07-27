begin;

create index if not exists idx_capital_market_events_archive_payload_cursor
  on public.capital_market_events (id)
  include (observed_at)
  where raw_payload <> '{}'::jsonb
     or normalized_payload <> '{}'::jsonb;

create index if not exists idx_source_documents_archive_payload_cursor
  on public.source_documents (id)
  include (observed_at)
  where raw_payload <> '{}'::jsonb
     or normalized_payload <> '{}'::jsonb;

create index if not exists idx_monitoring_outputs_archive_payload_cursor
  on public.monitoring_outputs (id)
  include (observed_at)
  where raw_text is not null
     or payload <> '{}'::jsonb
     or output_payload <> '{}'::jsonb
     or normalized_payload <> '{}'::jsonb;

analyze public.capital_market_events;
analyze public.source_documents;
analyze public.monitoring_outputs;

commit;
