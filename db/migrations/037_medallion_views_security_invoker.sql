-- Aplicada no banco vivo via Supabase MCP em 2026-06-11. Espelho de linhagem — não reexecutar.
-- DO NOT RUN from local migrations. This file documents the live medallion views and quality-gate RPC.

begin;

create or replace view public.medallion_bronze_historical_records
with (security_invoker = true) as
select
  id,
  dataset_code,
  record_key,
  ref_date,
  entity_cnpj,
  payload,
  source_url,
  content_hash,
  ingested_at
from public.bronze_historical_records;

create or replace view public.medallion_bronze_macro_series_observations
with (security_invoker = true) as
select
  series_code,
  series_name,
  ref_date,
  value,
  unit,
  source,
  ingested_at
from public.macro_series_observations;

create or replace view public.medallion_silver_fidc_monthly_informes
with (security_invoker = true) as
select
  record_key,
  ref_date,
  entity_cnpj,
  nullif(regexp_replace(coalesce(payload ->> 'DENOM_SOCIAL', payload ->> 'NOME_FUNDO', ''), '\s+', ' ', 'g'), '') as fund_name,
  payload,
  source_url,
  content_hash,
  ingested_at
from public.bronze_historical_records
where dataset_code = 'cvm_fidc_inf_mensal';

create or replace view public.medallion_silver_macro_series_monthly
with (security_invoker = true) as
select
  series_code,
  max(series_name) as series_name,
  date_trunc('month', ref_date)::date as ref_month,
  avg(value)::numeric as value,
  max(unit) as unit,
  max(source) as source,
  count(*)::integer as observation_count,
  max(ingested_at) as ingested_at
from public.macro_series_observations
group by series_code, date_trunc('month', ref_date)::date;

create or replace view public.medallion_silver_company_signal_rollups
with (security_invoker = true) as
select
  company_id,
  signal_type,
  count(*)::integer as signal_count,
  avg(confidence_score)::numeric as avg_confidence,
  avg(signal_strength)::numeric as avg_signal_strength,
  max(created_at) as last_signal_at
from public.company_signals
group by company_id, signal_type;

create or replace view public.medallion_gold_company_profiles
with (security_invoker = true) as
with signal_rollups as (
  select
    g.company_id,
    sum(g.signal_count)::integer as signal_count,
    avg(g.avg_confidence)::numeric as avg_signal_confidence,
    max(g.last_signal_at) as last_signal_at
  from public.medallion_silver_company_signal_rollups g
  group by g.company_id
),
latest_lead as (
  select distinct on (company_id)
    company_id,
    lead_score,
    bucket,
    next_action,
    created_at
  from public.lead_score_snapshots
  order by company_id, created_at desc
),
latest_ranking as (
  select distinct on (company_id)
    company_id,
    score_value as ranking_score,
    created_at
  from public.score_snapshots
  where score_type = 'ranking'
  order by company_id, created_at desc
)
select
  c.id as company_id,
  c.legal_name,
  coalesce(c.trade_name, c.legal_name) as trade_name,
  c.cnpj,
  c.segment,
  c.subsegment,
  c.geography,
  c.company_type,
  c.stage,
  coalesce(g.signal_count, 0) as signal_count,
  g.avg_signal_confidence,
  g.last_signal_at,
  l.lead_score,
  l.bucket,
  l.next_action,
  r.ranking_score,
  greatest(coalesce(l.created_at, c.updated_at), coalesce(r.created_at, c.updated_at), coalesce(g.last_signal_at, c.updated_at)) as profile_updated_at
from public.companies c
left join signal_rollups g on g.company_id = c.id
left join latest_lead l on l.company_id = c.id
left join latest_ranking r on r.company_id = c.id;

comment on view public.medallion_gold_company_profiles is
  'Gold profile view. Signal totals intentionally use sum(g.signal_count), not count(g.signal_type).';

create or replace function public.run_data_platform_quality_gates(max_rows integer default 5000)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  with checks as (
    select
      'bronze_historical_required_fields'::text as check_name,
      count(*)::integer as failures
    from (
      select *
      from public.bronze_historical_records
      order by ingested_at desc
      limit max_rows
    ) r
    where dataset_code is null
       or record_key is null
       or ref_date is null
       or payload is null
       or source_url is null
       or content_hash is null

    union all

    select
      'bronze_historical_duplicate_keys'::text as check_name,
      count(*)::integer as failures
    from (
      select dataset_code, record_key
      from public.bronze_historical_records
      group by dataset_code, record_key
      having count(*) > 1
    ) duplicates

    union all

    select
      'macro_series_required_fields'::text as check_name,
      count(*)::integer as failures
    from (
      select *
      from public.macro_series_observations
      order by ingested_at desc
      limit max_rows
    ) r
    where series_code is null
       or series_name is null
       or ref_date is null
       or value is null
       or unit is null
       or source is null

    union all

    select
      'macro_series_duplicate_keys'::text as check_name,
      count(*)::integer as failures
    from (
      select series_code, ref_date
      from public.macro_series_observations
      group by series_code, ref_date
      having count(*) > 1
    ) duplicates

    union all

    select
      'gold_company_profiles_signal_counts'::text as check_name,
      count(*)::integer as failures
    from public.medallion_gold_company_profiles
    where signal_count is null or signal_count < 0
  )
  select jsonb_build_object(
    'checked_at', now(),
    'max_rows', max_rows,
    'status', case when bool_or(failures > 0) then 'fail' else 'pass' end,
    'checks', jsonb_agg(jsonb_build_object(
      'name', check_name,
      'status', case when failures > 0 then 'fail' else 'pass' end,
      'failures', failures
    ) order by check_name)
  )
  into result
  from checks;

  return result;
end;
$$;

commit;
