-- ORIGINATION INTELLIGENCE PLATFORM
-- Supabase hot database / Google Drive + Sheets cold archive.
-- Execute only with service-role or postgres privileges.

-- 1) Capture the current budget state.
select private.capture_database_storage_snapshot();

select
  database_mb,
  state,
  round((free_quota_bytes - database_bytes) / 1024.0 / 1024.0, 2) as margin_to_quota_mb,
  captured_at
from public.database_storage_health_v1;

-- 2) The guard must block backfills while the database is above the safe target.
select public.assert_ingestion_storage_budget(
  p_operation := 'maintenance_probe',
  p_requested_rows := 0,
  p_trigger_type := 'manual'
);

-- 3) Request archival of the oldest/heaviest eligible population.
select private.queue_free_tier_archive_if_needed();

-- 4) Do not compact while any archive run is not finalized.
select count(*) as active_archive_runs
from public.data_archive_runs
where status in ('queued', 'running', 'completed', 'verified');

-- 5) Inspect the largest tables before any physical compaction.
select
  relname as table_name,
  n_live_tup,
  n_dead_tup,
  round(pg_total_relation_size(relid) / 1024.0 / 1024.0, 2) as total_size_mb
from pg_stat_user_tables
order by pg_total_relation_size(relid) desc
limit 20;

-- 6) VACUUM FULL is emergency-only.
-- Run each command separately, only after the corresponding archive run is verified and pruned.
-- vacuum (full, analyze) public.bronze_historical_records;
-- vacuum (full, analyze) public.source_documents;
-- vacuum (full, analyze) public.monitoring_outputs;
-- vacuum (full, analyze) public.capital_market_events;

-- 7) Refresh statistics after prune/compaction.
analyze public.bronze_historical_records;
analyze public.capital_market_events;
analyze public.capital_market_entity_links;
analyze public.capital_market_metrics;

-- 8) Capture the final state.
select private.capture_database_storage_snapshot();
