create or replace view public.capital_market_ingestion_health as
with dataset_catalog(dataset_code, expected_interval) as (
  values
    ('cvm_offers'::text, interval '36 hours'),
    ('cvm_fund_registry'::text, interval '8 days'),
    ('cvm_fidc_monthly'::text, interval '8 days'),
    ('cvm_cri_monthly'::text, interval '8 days'),
    ('cvm_cra_monthly'::text, interval '8 days'),
    ('cvm_fii_monthly'::text, interval '8 days')
), ranked as (
  select r.*,
         row_number() over (partition by r.dataset_code order by r.started_at desc) as rn,
         max(r.finished_at) filter (where r.status = 'completed') over (partition by r.dataset_code) as last_success_at,
         count(*) filter (where r.started_at >= now() - interval '30 days') over (partition by r.dataset_code) as runs_30d,
         count(*) filter (where r.started_at >= now() - interval '30 days' and r.status = 'completed') over (partition by r.dataset_code) as successful_runs_30d,
         count(*) filter (where r.started_at >= now() - interval '30 days' and r.status = 'failed') over (partition by r.dataset_code) as failed_runs_30d
  from public.capital_market_dataset_runs r
)
select
  d.dataset_code,
  latest.status as latest_status,
  latest.trigger_type as latest_trigger_type,
  latest.started_at as latest_started_at,
  latest.finished_at as latest_finished_at,
  latest.last_success_at,
  case when latest.started_at is null then null else extract(epoch from (now() - latest.started_at))::bigint end as latest_age_seconds,
  case when latest.finished_at is null or latest.started_at is null then null else extract(epoch from (latest.finished_at - latest.started_at))::bigint end as latest_duration_seconds,
  coalesce(latest.files_processed, 0) as files_processed,
  coalesce(latest.resources_skipped, 0) as resources_skipped,
  coalesce(latest.records_seen, 0) as records_seen,
  coalesce(latest.records_inserted, 0) as records_inserted,
  coalesce(latest.records_updated, 0) as records_updated,
  coalesce(latest.records_unchanged, 0) as records_unchanged,
  coalesce(latest.events_written, 0) as events_written,
  coalesce(latest.signals_written, 0) as signals_written,
  coalesce(latest.runs_30d, 0) as runs_30d,
  coalesce(latest.successful_runs_30d, 0) as successful_runs_30d,
  coalesce(latest.failed_runs_30d, 0) as failed_runs_30d,
  case when coalesce(latest.runs_30d, 0) = 0 then null else round((latest.successful_runs_30d::numeric / latest.runs_30d::numeric) * 100, 1) end as success_rate_30d,
  latest.error_message,
  case
    when latest.started_at is null then 'never_run'
    when latest.status = 'running' and latest.started_at < now() - interval '30 minutes' then 'stale_running'
    when latest.status = 'failed' then 'failed'
    when latest.last_success_at is null then 'never_succeeded'
    when latest.last_success_at < now() - d.expected_interval then 'stale'
    when latest.status = 'partial' then 'partial'
    else 'healthy'
  end as health_status
from dataset_catalog d
left join ranked latest on latest.dataset_code = d.dataset_code and latest.rn = 1;

comment on view public.capital_market_ingestion_health is 'Operational health, freshness and write metrics for CVM capital-market datasets.';

grant select on public.capital_market_ingestion_health to authenticated;
grant select on public.capital_market_ingestion_health to service_role;
