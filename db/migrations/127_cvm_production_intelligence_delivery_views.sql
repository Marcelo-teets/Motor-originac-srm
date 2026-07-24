create or replace function public.sync_capital_market_delivery(p_dataset_code text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_signals_written integer := 0;
  v_candidates_result jsonb := '{}'::jsonb;
  v_candidates_upserted integer := 0;
  v_event_count integer := 0;
  v_linked_events integer := 0;
  v_generated_at timestamptz := now();
begin
  if nullif(trim(p_dataset_code), '') is null then
    raise exception 'p_dataset_code is required';
  end if;

  if p_dataset_code not in (
    'cvm_offers', 'cvm_fund_registry', 'cvm_fidc_monthly',
    'cvm_cri_monthly', 'cvm_cra_monthly', 'cvm_fii_monthly',
    'cvm_securitization_ots', 'cvm_fund_documents', 'cvm_company_fre',
    'cvm_company_itr', 'cvm_company_dfp'
  ) then
    raise exception 'Unsupported CVM dataset: %', p_dataset_code;
  end if;

  select count(*)::integer,
         count(*) filter (where issuer_company_id is not null)::integer
    into v_event_count, v_linked_events
  from public.capital_market_events
  where dataset_code = p_dataset_code;

  v_signals_written := coalesce(public.sync_capital_market_company_signals(p_dataset_code), 0);

  if p_dataset_code = 'cvm_offers' then
    v_candidates_result := coalesce(public.sync_capital_market_discovered_candidates(p_dataset_code), '{}'::jsonb);
    v_candidates_upserted := coalesce(nullif(v_candidates_result ->> 'upserted', '')::integer, 0);
  end if;

  update public.capital_market_dataset_runs run
  set signals_written = greatest(coalesce(run.signals_written, 0), v_signals_written),
      candidates_written = v_candidates_upserted,
      metadata = coalesce(run.metadata, '{}'::jsonb) || jsonb_build_object(
        'delivery', jsonb_build_object(
          'eventCount', v_event_count,
          'linkedEvents', v_linked_events,
          'signalsWritten', v_signals_written,
          'candidatesUpserted', v_candidates_upserted,
          'generatedAt', v_generated_at
        )
      ),
      updated_at = v_generated_at
  where run.id = (
    select latest.id
    from public.capital_market_dataset_runs latest
    where latest.dataset_code = p_dataset_code
      and latest.status in ('completed', 'partial')
    order by latest.started_at desc
    limit 1
  );

  update public.source_catalog source
  set status = case when v_event_count > 0 then 'real' else 'partial' end,
      health = case when v_event_count > 0 then 'healthy' else 'degraded' end,
      metadata = coalesce(source.metadata, '{}'::jsonb) || jsonb_build_object(
        'deliveryState', case when v_event_count > 0 then 'delivered' else 'empty' end,
        'lastDeliveryAt', v_generated_at,
        'lastDeliveryEventCount', v_event_count,
        'lastDeliveryLinkedEvents', v_linked_events,
        'lastDeliverySignalsWritten', v_signals_written,
        'lastDeliveryCandidatesUpserted', v_candidates_upserted
      ),
      updated_at = v_generated_at
  where source.metadata ->> 'datasetCode' = p_dataset_code;

  return jsonb_build_object(
    'datasetCode', p_dataset_code,
    'eventCount', v_event_count,
    'linkedEvents', v_linked_events,
    'signalsWritten', v_signals_written,
    'candidatesUpserted', v_candidates_upserted,
    'generatedAt', v_generated_at
  );
end;
$$;

revoke all on function public.sync_capital_market_delivery(text) from public, anon, authenticated;
grant execute on function public.sync_capital_market_delivery(text) to service_role;

create or replace view public.capital_market_delivery_health
with (security_invoker = true)
as
with datasets as (
  select
    source.id as source_id,
    source.name as source_name,
    source.metadata ->> 'datasetCode' as dataset_code,
    source.status as source_status,
    source.health as source_health,
    source.frequency,
    source.updated_at as source_updated_at
  from public.source_catalog source
  where source.metadata ->> 'datasetCode' in (
    'cvm_offers', 'cvm_fund_registry', 'cvm_fidc_monthly',
    'cvm_cri_monthly', 'cvm_cra_monthly', 'cvm_fii_monthly',
    'cvm_securitization_ots', 'cvm_fund_documents', 'cvm_company_fre',
    'cvm_company_itr', 'cvm_company_dfp'
  )
), latest_runs as (
  select distinct on (run.dataset_code)
    run.dataset_code,
    run.id as latest_run_id,
    run.status as latest_status,
    run.trigger_type as latest_trigger_type,
    run.started_at as latest_started_at,
    run.finished_at as latest_finished_at,
    run.records_seen,
    run.events_written,
    run.signals_written,
    run.candidates_written,
    run.resources_skipped,
    run.error_message,
    run.metadata
  from public.capital_market_dataset_runs run
  where run.dataset_code in (
    'cvm_offers', 'cvm_fund_registry', 'cvm_fidc_monthly',
    'cvm_cri_monthly', 'cvm_cra_monthly', 'cvm_fii_monthly',
    'cvm_securitization_ots', 'cvm_fund_documents', 'cvm_company_fre',
    'cvm_company_itr', 'cvm_company_dfp'
  )
  order by run.dataset_code, run.started_at desc
), last_success as (
  select
    run.dataset_code,
    max(run.finished_at) filter (where run.status in ('completed', 'partial')) as last_success_at
  from public.capital_market_dataset_runs run
  where run.dataset_code in (
    'cvm_offers', 'cvm_fund_registry', 'cvm_fidc_monthly',
    'cvm_cri_monthly', 'cvm_cra_monthly', 'cvm_fii_monthly',
    'cvm_securitization_ots', 'cvm_fund_documents', 'cvm_company_fre',
    'cvm_company_itr', 'cvm_company_dfp'
  )
  group by run.dataset_code
)
select
  dataset.source_id,
  dataset.source_name,
  dataset.dataset_code,
  dataset.source_status,
  dataset.source_health,
  dataset.frequency,
  latest.latest_run_id,
  latest.latest_status,
  latest.latest_trigger_type,
  latest.latest_started_at,
  latest.latest_finished_at,
  success.last_success_at,
  latest.records_seen,
  latest.events_written,
  latest.signals_written,
  latest.candidates_written,
  latest.resources_skipped,
  latest.error_message,
  (select count(*)::bigint from public.capital_market_resource_checkpoints checkpoint
    where checkpoint.dataset_code = dataset.dataset_code) as checkpoint_count,
  (select count(*)::bigint from public.capital_market_events event
    where event.dataset_code = dataset.dataset_code) as event_count,
  (select count(*)::bigint from public.capital_market_events event
    where event.dataset_code = dataset.dataset_code and event.issuer_company_id is not null) as linked_event_count,
  (select count(*)::bigint from public.company_signals signal
    where signal.metadata ->> 'datasetCode' = dataset.dataset_code
      and signal.metadata ? 'capitalMarketSignalKey') as signal_count,
  case when dataset.dataset_code = 'cvm_offers' then (
    select count(*)::bigint
    from public.discovered_company_candidates candidate
    where candidate.raw_payload ->> 'origin' = 'cvm_capital_market_event'
  ) else 0::bigint end as candidate_count,
  case
    when latest.latest_run_id is null then 'never_run'
    when latest.latest_status = 'failed' then 'failed'
    when success.last_success_at is null then 'never_succeeded'
    when dataset.dataset_code = 'cvm_offers'
      and success.last_success_at < now() - interval '72 hours' then 'stale'
    when dataset.dataset_code <> 'cvm_offers'
      and success.last_success_at < now() - interval '10 days' then 'stale'
    when not exists (
      select 1 from public.capital_market_events event
      where event.dataset_code = dataset.dataset_code
    ) then 'empty'
    else 'healthy'
  end as delivery_status
from datasets dataset
left join latest_runs latest using (dataset_code)
left join last_success success using (dataset_code);

revoke all on public.capital_market_delivery_health from public, anon;
grant select on public.capital_market_delivery_health to authenticated, service_role;

create or replace view public.capital_market_company_intelligence_v1
with (security_invoker = true)
as
select
  link.company_id,
  event.id as capital_market_event_id,
  event.dataset_code,
  event.event_type,
  event.instrument_type,
  event.offer_id,
  event.security_code,
  event.series,
  event.status,
  event.reference_date,
  event.event_date,
  event.maturity_date,
  event.volume,
  event.currency,
  event.source_url,
  event.observed_at,
  jsonb_agg(distinct jsonb_build_object(
    'role', current_link.entity_role,
    'cnpj', current_link.entity_cnpj,
    'name', current_link.entity_name,
    'primaryOriginationTarget', current_link.is_primary_origination_target,
    'confidence', current_link.resolution_confidence
  )) filter (where current_link.id is not null) as entity_roles,
  jsonb_agg(distinct jsonb_build_object(
    'code', metric.metric_code,
    'label', metric.metric_label,
    'value', metric.metric_value,
    'unit', metric.metric_unit,
    'referenceDate', metric.reference_date,
    'scope', metric.measurement_scope
  )) filter (where metric.id is not null) as metrics
from public.capital_market_events event
join public.capital_market_entity_links link
  on link.dataset_code = event.dataset_code
 and link.record_key = event.record_key
 and link.content_hash = event.content_hash
 and link.is_primary_origination_target
 and link.company_id is not null
left join public.capital_market_entity_links current_link
  on current_link.dataset_code = event.dataset_code
 and current_link.record_key = event.record_key
 and current_link.content_hash = event.content_hash
left join public.capital_market_metrics metric
  on metric.dataset_code = event.dataset_code
 and metric.record_key = event.record_key
 and metric.content_hash = event.content_hash
where link.company_id is not null
group by
  link.company_id, event.id, event.dataset_code, event.event_type,
  event.instrument_type, event.offer_id, event.security_code, event.series,
  event.status, event.reference_date, event.event_date, event.maturity_date,
  event.volume, event.currency, event.source_url, event.observed_at;

create or replace view public.capital_market_maturity_wall_v1
with (security_invoker = true)
as
select
  intelligence.company_id,
  intelligence.capital_market_event_id,
  intelligence.instrument_type,
  intelligence.offer_id,
  intelligence.security_code,
  intelligence.series,
  intelligence.maturity_date,
  intelligence.volume,
  intelligence.currency,
  greatest(
    0,
    extract(year from age(intelligence.maturity_date, current_date))::integer * 12
      + extract(month from age(intelligence.maturity_date, current_date))::integer
  ) as months_to_maturity,
  intelligence.source_url,
  intelligence.observed_at
from public.capital_market_company_intelligence_v1 intelligence
where intelligence.maturity_date is not null
  and intelligence.maturity_date >= current_date;

revoke all on public.capital_market_company_intelligence_v1 from public, anon;
revoke all on public.capital_market_maturity_wall_v1 from public, anon;
grant select on public.capital_market_company_intelligence_v1 to authenticated, service_role;
grant select on public.capital_market_maturity_wall_v1 to authenticated, service_role;

comment on table public.capital_market_entity_links is
  'Papéis jurídicos separados por evento CVM. Apenas primary origination targets podem gerar sinais comerciais.';
comment on table public.capital_market_metrics is
  'Métricas tipadas extraídas de ofertas, informes, FRE, ITR e DFP com lineage por coluna oficial.';
comment on view public.capital_market_company_intelligence_v1 is
  'Camada operacional CVM por empresa, reunindo evento, papéis e métricas atuais.';
