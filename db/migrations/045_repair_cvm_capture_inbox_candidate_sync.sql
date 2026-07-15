-- Repair the candidate sync projection for environments where migration 044 was already applied.

create or replace function public.sync_capital_market_discovered_candidates(
  p_dataset_code text default 'cvm_offers'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_upserted integer := 0;
begin
  if p_dataset_code is distinct from 'cvm_offers' then
    return jsonb_build_object(
      'datasetCode', p_dataset_code,
      'upserted', 0,
      'reason', 'dataset_not_eligible_for_company_discovery'
    );
  end if;

  with eligible as (
    select
      event.*,
      regexp_replace(coalesce(event.issuer_cnpj, ''), '[^0-9]', '', 'g') as issuer_cnpj_digits,
      coalesce(event.event_date, event.reference_date, event.observed_at::date) as effective_date
    from public.capital_market_events event
    where event.dataset_code = p_dataset_code
      and event.issuer_company_id is null
      and nullif(trim(event.issuer_name), '') is not null
      and length(regexp_replace(coalesce(event.issuer_cnpj, ''), '[^0-9]', '', 'g')) = 14
      and event.instrument_type in ('DEBENTURE', 'CRI', 'CRA', 'FIDC')
      and coalesce(event.event_date, event.reference_date, event.observed_at::date)
        >= current_date - interval '24 months'
  ),
  grouped as (
    select
      issuer_cnpj_digits,
      count(*)::integer as event_count,
      array_agg(distinct instrument_type order by instrument_type) as instruments,
      max(effective_date) as latest_effective_date,
      max(observed_at) as latest_observed_at,
      max(volume) as max_observed_volume
    from eligible
    group by issuer_cnpj_digits
  ),
  latest as (
    select distinct on (issuer_cnpj_digits)
      issuer_cnpj_digits,
      id as latest_event_id,
      record_key as latest_record_key,
      issuer_name,
      instrument_type as latest_instrument_type,
      offer_id,
      security_code,
      series,
      status,
      volume as latest_volume,
      observed_at,
      source_url,
      source_resource_name,
      source_file_name
    from eligible
    order by issuer_cnpj_digits, effective_date desc, observed_at desc, updated_at desc
  ),
  candidate_source as (
    select
      grouped.issuer_cnpj_digits,
      grouped.event_count,
      grouped.instruments,
      grouped.latest_effective_date,
      grouped.latest_observed_at,
      grouped.max_observed_volume,
      latest.latest_event_id,
      latest.latest_record_key,
      latest.issuer_name,
      latest.latest_instrument_type,
      latest.offer_id,
      latest.security_code,
      latest.series,
      latest.status,
      latest.latest_volume,
      latest.source_url,
      latest.source_resource_name,
      latest.source_file_name,
      'cvm:issuer:' || grouped.issuer_cnpj_digits as dedupe_key
    from grouped
    join latest
      on latest.issuer_cnpj_digits = grouped.issuer_cnpj_digits
    where not exists (
      select 1
      from public.companies company
      where regexp_replace(coalesce(company.cnpj, ''), '[^0-9]', '', 'g') = grouped.issuer_cnpj_digits
    )
  ),
  upserted as (
    insert into public.discovered_company_candidates (
      id,
      search_profile_run_id,
      search_profile_id,
      company_name,
      legal_name,
      website,
      normalized_domain,
      cnpj,
      geography,
      segment,
      subsegment,
      company_type,
      credit_product,
      target_structure,
      source_ref,
      source_url,
      evidence_summary,
      receivables,
      confidence,
      candidate_status,
      company_id,
      dedupe_key,
      raw_payload,
      captured_at,
      promoted_at,
      created_at,
      updated_at
    )
    select
      gen_random_uuid(),
      null,
      null,
      source.issuer_name,
      source.issuer_name,
      null,
      null,
      source.issuer_cnpj_digits,
      'Brasil',
      case source.latest_instrument_type
        when 'FIDC' then 'Crédito e Recebíveis'
        when 'CRI' then 'Crédito Imobiliário'
        when 'CRA' then 'Agronegócio'
        else 'Middle Market / DCM'
      end,
      array_to_string(source.instruments, ', '),
      'Emissor / Originador',
      case
        when 'FIDC' = any(source.instruments) then 'Carteira ou recebíveis — validar originador e lastro'
        else 'Produto de crédito não confirmado — validar na qualificação'
      end,
      case source.latest_instrument_type
        when 'FIDC' then 'FIDC'
        when 'CRI' then 'CRI / securitização imobiliária'
        when 'CRA' then 'CRA / securitização agro'
        else 'Debênture / Nota Comercial'
      end,
      'capital_market_event:' || source.latest_record_key,
      source.source_url,
      concat(
        'Fonte regulatória CVM: ', source.issuer_name,
        ' apareceu em ', source.event_count, ' evento(s) de ', array_to_string(source.instruments, ', '),
        '. Registro mais recente em ', to_char(source.latest_effective_date, 'DD/MM/YYYY'),
        case when source.latest_volume is not null then concat(', volume observado de R$ ', source.latest_volume::text) else '' end,
        case when nullif(source.status, '') is not null then concat(', status ', source.status) else '' end,
        '. Validar aderência ao ICP, necessidade de funding e próxima ação comercial.'
      ),
      jsonb_build_object(
        'instrumentTypes', to_jsonb(source.instruments),
        'eventCount', source.event_count,
        'latestVolume', source.latest_volume,
        'maxObservedVolume', source.max_observed_volume,
        'latestStatus', source.status,
        'latestDate', source.latest_effective_date
      ),
      case
        when 'FIDC' = any(source.instruments) then 0.98
        when source.latest_instrument_type in ('CRI', 'CRA') then 0.97
        else 0.95
      end,
      'new',
      null,
      source.dedupe_key,
      jsonb_build_object(
        'origin', 'cvm_capital_market_event',
        'latestEventId', source.latest_event_id,
        'latestRecordKey', source.latest_record_key,
        'issuerCnpj', source.issuer_cnpj_digits,
        'issuerName', source.issuer_name,
        'instrumentTypes', to_jsonb(source.instruments),
        'latestInstrumentType', source.latest_instrument_type,
        'offerId', source.offer_id,
        'securityCode', source.security_code,
        'series', source.series,
        'status', source.status,
        'latestVolume', source.latest_volume,
        'eventCount', source.event_count,
        'sourceResourceName', source.source_resource_name,
        'sourceFileName', source.source_file_name
      ),
      source.latest_observed_at,
      null,
      now(),
      now()
    from candidate_source source
    on conflict (dedupe_key) where dedupe_key is not null
    do update set
      company_name = excluded.company_name,
      legal_name = excluded.legal_name,
      cnpj = excluded.cnpj,
      segment = excluded.segment,
      subsegment = excluded.subsegment,
      company_type = excluded.company_type,
      credit_product = excluded.credit_product,
      target_structure = excluded.target_structure,
      source_ref = excluded.source_ref,
      source_url = excluded.source_url,
      evidence_summary = excluded.evidence_summary,
      receivables = excluded.receivables,
      confidence = excluded.confidence,
      raw_payload = excluded.raw_payload,
      captured_at = excluded.captured_at,
      updated_at = now()
    where public.discovered_company_candidates.company_id is null
      and coalesce(public.discovered_company_candidates.candidate_status, 'new') not in ('promoted', 'rejected')
    returning id
  )
  select count(*)::integer into v_upserted from upserted;

  return jsonb_build_object(
    'datasetCode', p_dataset_code,
    'upserted', v_upserted,
    'generatedAt', now()
  );
end;
$$;

revoke all on function public.sync_capital_market_discovered_candidates(text) from public;
grant execute on function public.sync_capital_market_discovered_candidates(text) to service_role;
