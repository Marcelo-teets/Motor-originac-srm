create or replace function public.sync_capital_market_company_signals(p_dataset_code text default null)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  inserted_count integer := 0;
  current_inserted integer := 0;
begin
  update public.capital_market_entity_links link
  set company_id = company.id,
      updated_at = now()
  from public.companies company
  where link.company_id is distinct from company.id
    and link.entity_cnpj is not null
    and regexp_replace(coalesce(company.cnpj, ''), '[^0-9]', '', 'g') = link.entity_cnpj
    and (p_dataset_code is null or link.dataset_code = p_dataset_code);

  with preferred_target as (
    select distinct on (event.id)
      event.id as event_id,
      link.company_id
    from public.capital_market_events event
    join public.capital_market_entity_links link
      on link.dataset_code = event.dataset_code
     and link.record_key = event.record_key
     and link.content_hash = event.content_hash
     and link.is_primary_origination_target
     and link.company_id is not null
    where p_dataset_code is null or event.dataset_code = p_dataset_code
    order by
      event.id,
      case link.entity_role
        when 'debtor' then 1
        when 'originator' then 2
        when 'assignor' then 3
        when 'issuer' then 4
        else 9
      end,
      link.resolution_confidence desc
  )
  update public.capital_market_events event
  set issuer_company_id = target.company_id,
      updated_at = now()
  from preferred_target target
  where event.id = target.event_id
    and event.issuer_company_id is distinct from target.company_id;

  insert into public.company_signals (
    id, company_id, source_id, monitoring_output_id, signal_type, signal_label,
    strength, confidence, is_explicit, evidence_url, evidence_text, observed_at,
    metadata, signal_strength, confidence_score, evidence_payload,
    observed_vs_inferred, created_at, updated_at
  )
  select distinct on (link.company_id, event.record_key)
    gen_random_uuid(),
    link.company_id,
    source.id,
    null,
    'capital_market_event',
    concat(event.instrument_type, ' · ', replace(event.event_type, '_', ' ')),
    case
      when event.event_type = 'public_offering' then 90
      when event.event_type = 'fund_document_filing' then 82
      when event.event_type in ('company_quarterly_financial_snapshot', 'company_annual_financial_snapshot') then 78
      when event.event_type = 'company_reference_snapshot' then 76
      when event.event_type = 'fund_registration' then 74
      else 68
    end,
    round((least(link.resolution_confidence, 0.99) * 100)::numeric, 2),
    true,
    event.source_url,
    concat_ws(
      ' · ',
      coalesce(link.entity_name, event.issuer_name, event.fund_name),
      link.entity_role,
      event.instrument_type,
      event.status,
      case when event.volume is not null then concat('R$ ', event.volume::text) end
    ),
    event.observed_at,
    jsonb_build_object(
      'capitalMarketEventId', event.id,
      'capitalMarketRecordKey', event.record_key,
      'capitalMarketSignalKey', concat(event.record_key, ':event'),
      'datasetCode', event.dataset_code,
      'sourceCode', event.source_code,
      'instrumentType', event.instrument_type,
      'eventType', event.event_type,
      'entityRole', link.entity_role,
      'entityCnpj', link.entity_cnpj,
      'offerId', event.offer_id,
      'securityCode', event.security_code,
      'referenceDate', event.reference_date,
      'eventDate', event.event_date,
      'maturityDate', event.maturity_date,
      'volume', event.volume,
      'status', event.status
    ),
    case
      when event.event_type = 'public_offering' then 90
      when event.event_type = 'fund_document_filing' then 82
      when event.event_type in ('company_quarterly_financial_snapshot', 'company_annual_financial_snapshot') then 78
      when event.event_type = 'company_reference_snapshot' then 76
      when event.event_type = 'fund_registration' then 74
      else 68
    end,
    least(link.resolution_confidence, 0.99),
    jsonb_build_object(
      'label', concat(event.instrument_type, ' · ', replace(event.event_type, '_', ' ')),
      'summary', concat_ws(' · ', coalesce(link.entity_name, event.issuer_name, event.fund_name), link.entity_role, event.status),
      'sourceUrl', event.source_url,
      'datasetCode', event.dataset_code,
      'recordKey', event.record_key,
      'entityRole', link.entity_role
    ),
    'observed',
    now(),
    now()
  from public.capital_market_events event
  join public.capital_market_entity_links link
    on link.dataset_code = event.dataset_code
   and link.record_key = event.record_key
   and link.content_hash = event.content_hash
   and link.is_primary_origination_target
   and link.company_id is not null
  left join public.source_catalog source
    on source.metadata ->> 'code' = event.source_code
  where (p_dataset_code is null or event.dataset_code = p_dataset_code)
    and event.event_type not in (
      'company_quarterly_financial_snapshot',
      'company_annual_financial_snapshot',
      'company_reference_snapshot'
    )
  order by link.company_id, event.record_key, link.resolution_confidence desc
  on conflict do nothing;

  get diagnostics current_inserted = row_count;
  inserted_count := inserted_count + current_inserted;

  insert into public.company_signals (
    id, company_id, source_id, monitoring_output_id, signal_type, signal_label,
    strength, confidence, is_explicit, evidence_url, evidence_text, observed_at,
    metadata, signal_strength, confidence_score, evidence_payload,
    observed_vs_inferred, created_at, updated_at
  )
  select distinct on (link.company_id, event.record_key)
    gen_random_uuid(),
    link.company_id,
    source.id,
    null,
    'capital_market_refinancing_window',
    concat(event.instrument_type, ' · vencimento em ', event.maturity_date),
    case
      when event.maturity_date <= current_date + interval '6 months' then 96
      when event.maturity_date <= current_date + interval '12 months' then 90
      else 82
    end,
    98,
    true,
    event.source_url,
    concat_ws(' · ', coalesce(link.entity_name, event.issuer_name), event.instrument_type, event.maturity_date::text, event.volume::text),
    event.observed_at,
    jsonb_build_object(
      'capitalMarketSignalKey', concat(event.record_key, ':maturity'),
      'capitalMarketRecordKey', event.record_key,
      'datasetCode', event.dataset_code,
      'instrumentType', event.instrument_type,
      'entityRole', link.entity_role,
      'maturityDate', event.maturity_date,
      'volume', event.volume,
      'monthsToMaturity', greatest(0, extract(year from age(event.maturity_date, current_date)) * 12 + extract(month from age(event.maturity_date, current_date)))
    ),
    case
      when event.maturity_date <= current_date + interval '6 months' then 96
      when event.maturity_date <= current_date + interval '12 months' then 90
      else 82
    end,
    0.98,
    jsonb_build_object(
      'label', concat(event.instrument_type, ' · janela de refinanciamento'),
      'summary', concat('Vencimento oficial em ', event.maturity_date::text),
      'sourceUrl', event.source_url,
      'recordKey', event.record_key
    ),
    'observed',
    now(),
    now()
  from public.capital_market_events event
  join public.capital_market_entity_links link
    on link.dataset_code = event.dataset_code
   and link.record_key = event.record_key
   and link.content_hash = event.content_hash
   and link.is_primary_origination_target
   and link.company_id is not null
  left join public.source_catalog source
    on source.metadata ->> 'code' = event.source_code
  where event.maturity_date > current_date
    and event.maturity_date <= current_date + interval '24 months'
    and (p_dataset_code is null or event.dataset_code = p_dataset_code)
  order by link.company_id, event.record_key, link.resolution_confidence desc
  on conflict do nothing;

  get diagnostics current_inserted = row_count;
  inserted_count := inserted_count + current_inserted;

  with current_metrics as (
    select distinct on (link.company_id, metric.metric_code)
      link.company_id,
      event.source_code,
      event.source_url,
      event.instrument_type,
      event.record_key,
      event.dataset_code,
      metric.metric_code,
      metric.metric_label,
      metric.metric_value,
      metric.metric_unit,
      metric.reference_date,
      event.observed_at
    from public.capital_market_metrics metric
    join public.capital_market_events event
      on event.dataset_code = metric.dataset_code
     and event.record_key = metric.record_key
     and event.content_hash = metric.content_hash
    join public.capital_market_entity_links link
      on link.dataset_code = event.dataset_code
     and link.record_key = event.record_key
     and link.content_hash = event.content_hash
     and link.is_primary_origination_target
     and link.company_id is not null
    where metric.reference_date is not null
      and metric.metric_code in (
        'receivables_balance', 'fund_nav', 'delinquent_balance',
        'delinquency_ratio', 'subordination_ratio',
        'trade_receivables', 'short_term_debt', 'long_term_debt',
        'cash_and_equivalents', 'net_revenue', 'operating_cash_flow'
      )
      and (p_dataset_code is null or event.dataset_code = p_dataset_code)
    order by link.company_id, metric.metric_code, metric.reference_date desc,
      case when coalesce(metric.measurement_scope, '') ilike '%consolid%' then 0 else 1 end,
      event.observed_at desc
  ), comparisons as (
    select current_metric.*,
      previous.metric_value as previous_value,
      previous.reference_date as previous_reference_date,
      case
        when previous.metric_value is null or previous.metric_value = 0 then null
        else ((current_metric.metric_value - previous.metric_value) / abs(previous.metric_value)) * 100
      end as change_pct,
      current_metric.metric_value - previous.metric_value as absolute_change
    from current_metrics current_metric
    left join lateral (
      select previous_metric.metric_value, previous_metric.reference_date
      from public.capital_market_metrics previous_metric
      join public.capital_market_events previous_event
        on previous_event.dataset_code = previous_metric.dataset_code
       and previous_event.record_key = previous_metric.record_key
       and previous_event.content_hash = previous_metric.content_hash
      join public.capital_market_entity_links previous_link
        on previous_link.dataset_code = previous_event.dataset_code
       and previous_link.record_key = previous_event.record_key
       and previous_link.content_hash = previous_event.content_hash
       and previous_link.is_primary_origination_target
       and previous_link.company_id = current_metric.company_id
      where previous_metric.metric_code = current_metric.metric_code
        and previous_metric.reference_date < current_metric.reference_date
      order by previous_metric.reference_date desc, previous_event.observed_at desc
      limit 1
    ) previous on true
  ), qualified as (
    select comparison.*,
      case
        when comparison.metric_code in ('receivables_balance', 'fund_nav') and comparison.change_pct >= 20
          then 'fidc_portfolio_growth'
        when comparison.metric_code = 'delinquent_balance' and comparison.change_pct >= 25
          then 'fidc_delinquency_deterioration'
        when comparison.metric_code = 'delinquency_ratio' and comparison.absolute_change >= 2
          then 'fidc_delinquency_deterioration'
        when comparison.metric_code = 'subordination_ratio' and comparison.absolute_change <= -2
          then 'subordination_pressure'
        when comparison.metric_code in ('trade_receivables') and comparison.change_pct >= 20
          then 'receivables_growth'
        when comparison.metric_code = 'short_term_debt' and comparison.change_pct >= 20
          then 'short_term_debt_growth'
        when comparison.metric_code = 'long_term_debt' and comparison.change_pct >= 20
          then 'structured_funding_expansion'
        when comparison.metric_code = 'cash_and_equivalents' and comparison.change_pct <= -25
          then 'liquidity_pressure'
        when comparison.metric_code = 'net_revenue' and comparison.change_pct >= 20
          then 'revenue_acceleration'
        when comparison.metric_code = 'operating_cash_flow'
          and comparison.metric_value < 0
          and coalesce(comparison.previous_value, 0) >= 0
          then 'cash_flow_deterioration'
        else null
      end as derived_signal_type
    from comparisons comparison
  )
  insert into public.company_signals (
    id, company_id, source_id, monitoring_output_id, signal_type, signal_label,
    strength, confidence, is_explicit, evidence_url, evidence_text, observed_at,
    metadata, signal_strength, confidence_score, evidence_payload,
    observed_vs_inferred, created_at, updated_at
  )
  select
    gen_random_uuid(),
    qualified.company_id,
    source.id,
    null,
    qualified.derived_signal_type,
    concat(coalesce(qualified.metric_label, qualified.metric_code), ' · ', round(qualified.change_pct, 2), '%'),
    case qualified.derived_signal_type
      when 'fidc_delinquency_deterioration' then 94
      when 'subordination_pressure' then 90
      when 'liquidity_pressure' then 92
      when 'cash_flow_deterioration' then 92
      when 'short_term_debt_growth' then 88
      else 84
    end,
    92,
    true,
    qualified.source_url,
    concat_ws(
      ' · ',
      qualified.instrument_type,
      qualified.metric_code,
      concat('atual=', qualified.metric_value),
      concat('anterior=', qualified.previous_value),
      concat('variacao=', round(qualified.change_pct, 2), '%')
    ),
    qualified.observed_at,
    jsonb_build_object(
      'capitalMarketSignalKey', concat(qualified.record_key, ':', qualified.derived_signal_type, ':', qualified.metric_code),
      'capitalMarketRecordKey', qualified.record_key,
      'datasetCode', qualified.dataset_code,
      'instrumentType', qualified.instrument_type,
      'metricCode', qualified.metric_code,
      'metricUnit', qualified.metric_unit,
      'currentValue', qualified.metric_value,
      'previousValue', qualified.previous_value,
      'changePct', qualified.change_pct,
      'currentReferenceDate', qualified.reference_date,
      'previousReferenceDate', qualified.previous_reference_date
    ),
    case qualified.derived_signal_type
      when 'fidc_delinquency_deterioration' then 94
      when 'subordination_pressure' then 90
      when 'liquidity_pressure' then 92
      when 'cash_flow_deterioration' then 92
      when 'short_term_debt_growth' then 88
      else 84
    end,
    0.92,
    jsonb_build_object(
      'label', concat(coalesce(qualified.metric_label, qualified.metric_code), ' · tendência CVM'),
      'summary', concat('Variação oficial de ', round(qualified.change_pct, 2), '% entre competências'),
      'sourceUrl', qualified.source_url,
      'recordKey', qualified.record_key
    ),
    'observed',
    now(),
    now()
  from qualified
  left join public.source_catalog source
    on source.metadata ->> 'code' = qualified.source_code
  where qualified.derived_signal_type is not null
    and qualified.previous_value is not null
  on conflict do nothing;

  get diagnostics current_inserted = row_count;
  inserted_count := inserted_count + current_inserted;

  update public.companies company
  set has_structured_debt = true,
      updated_at = now()
  where exists (
    select 1
    from public.capital_market_entity_links link
    join public.capital_market_events event
      on event.dataset_code = link.dataset_code
     and event.record_key = link.record_key
     and event.content_hash = link.content_hash
    where link.company_id = company.id
      and link.is_primary_origination_target
      and event.instrument_type in ('DEBENTURE', 'NOTA_COMERCIAL', 'CRI', 'CRA', 'FIDC', 'OUTRO_TITULO_SECURITIZACAO')
      and (p_dataset_code is null or event.dataset_code = p_dataset_code)
  );

  update public.companies company
  set has_fidc = true,
      has_receivables = true,
      updated_at = now()
  where exists (
    select 1
    from public.capital_market_entity_links link
    join public.capital_market_events event
      on event.dataset_code = link.dataset_code
     and event.record_key = link.record_key
     and event.content_hash = link.content_hash
    where link.company_id = company.id
      and link.is_primary_origination_target
      and event.instrument_type = 'FIDC'
      and (p_dataset_code is null or event.dataset_code = p_dataset_code)
  );

  return inserted_count;
end;
$$;

revoke all on function public.sync_capital_market_company_signals(text) from public, anon, authenticated;
grant execute on function public.sync_capital_market_company_signals(text) to service_role;
