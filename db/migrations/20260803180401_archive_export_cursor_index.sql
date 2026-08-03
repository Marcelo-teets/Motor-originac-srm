-- The archive worker paginates capital-market payloads by record_key.
-- The due-date index is useful for scheduling, but cannot satisfy
-- ORDER BY record_key once observed_at is a range predicate.
-- This partial cursor index matches the worker's real PostgREST access path.

create index if not exists idx_capital_market_events_archive_dataset_cursor
  on public.capital_market_events (dataset_code, record_key)
  include (observed_at)
  where raw_payload <> '{}'::jsonb
     or normalized_payload <> '{}'::jsonb;
