-- ORIGINATION INTELLIGENCE PLATFORM
-- Supabase hot database / Google Drive + Sheets cold archive.
-- Execute only with service-role or postgres privileges.

select private.capture_database_storage_snapshot();

select database_mb,state,round((free_quota_bytes-database_bytes)/1024.0/1024.0,2) as margin_to_quota_mb,captured_at
from public.database_storage_health_v1;

select public.assert_ingestion_storage_budget('maintenance_probe',0,'manual');
select private.queue_free_tier_archive_if_needed();

select count(*) as active_archive_runs
from public.data_archive_runs
where status in ('queued','running','completed','verified');

select relname as table_name,n_live_tup,n_dead_tup,
       round(pg_total_relation_size(relid)/1024.0/1024.0,2) as total_size_mb
from pg_stat_user_tables
order by pg_total_relation_size(relid) desc
limit 20;

-- VACUUM FULL is emergency-only, after verified prune, one command at a time.
-- vacuum (full, analyze) public.bronze_historical_records;
-- vacuum (full, analyze) public.capital_market_events;

analyze public.bronze_historical_records;
analyze public.capital_market_events;
analyze public.capital_market_entity_links;
analyze public.capital_market_metrics;
select private.capture_database_storage_snapshot();
