-- Converts normalized public records into monitoring outputs and explainable signals.
-- RFB baseline snapshots never create score impact without a material diff.

create or replace function public.sync_public_dataset_company_outputs(p_dataset_code text default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  outputs_count integer := 0;
  signals_count integer := 0;
  rfb_count integer := 0;
begin
  update public.public_company_records record
  set company_id = company.id,
      updated_at = now()
  from public.companies company
  where record.company_id is null
    and (
      regexp_replace(coalesce(company.cnpj, ''), '[^0-9]', '', 'g') = record.entity_cnpj
      or (
        length(record.entity_cnpj) = 8
        and left(regexp_replace(coalesce(company.cnpj, ''), '[^0-9]', '', 'g'), 8) = record.entity_cnpj
      )
    )
    and (p_dataset_code is null or record.dataset_code = p_dataset_code);

  insert into public.monitoring_outputs (
    id, company_id, source_id, search_profile_id, output_type, title, url,
    raw_text, summary, observed_at, processed_at, status, source_confidence,
    payload, created_at, updated_at, output_payload, normalized_payload,
    confidence_score, connector_status, observed_vs_inferred
  )
  select
    gen_random_uuid(), record.company_id, source.id, null, 'public_dataset_record',
    concat(replace(record.record_type, '_', ' '), ' · ', coalesce(record.entity_name, record.entity_cnpj)),
    record.source_url, record.raw_payload::text,
    coalesce(record.normalized_payload ->> 'summary', concat(coalesce(record.entity_name, record.entity_cnpj), ' · ', record.record_type)),
    record.observed_at, now(), 'processed', 0.96,
    jsonb_build_object(
      'publicRecordKey', record.record_key,
      'datasetCode', record.dataset_code,
      'sourceCode', record.source_code,
      'recordType', record.record_type,
      'entityCnpj', record.entity_cnpj,
      'referenceDate', record.reference_date,
      'resourceKey', record.resource_key,
      'contentHash', record.content_hash
    ),
    now(), now(), record.raw_payload, record.normalized_payload,
    0.96, 'real', 'observed'
  from public.public_company_records record
  left join public.source_catalog source on source.metadata ->> 'code' = record.source_code
  where record.company_id is not null
    and (p_dataset_code is null or record.dataset_code = p_dataset_code)
  on conflict do nothing;
  get diagnostics outputs_count = row_count;

  insert into public.company_signals (
    id, company_id, source_id, monitoring_output_id, signal_type, signal_label,
    strength, confidence, is_explicit, evidence_url, evidence_text, observed_at,
    metadata, signal_strength, confidence_score, evidence_payload,
    observed_vs_inferred, created_at, updated_at
  )
  select
    gen_random_uuid(), record.company_id, source.id, output.id,
    case record.record_type
      when 'bndes_financing' then 'public_financing_signal'
      when 'pgfn_debt' then 'fiscal_stress'
      when 'cgu_ceis' then 'legal_compliance_risk'
      when 'cgu_cnep' then 'legal_compliance_risk'
      when 'public_contract' then 'public_contract_receivables'
    end,
    case record.record_type
      when 'bndes_financing' then 'Histórico de financiamento BNDES'
      when 'pgfn_debt' then 'Registro em dívida ativa'
      when 'cgu_ceis' then 'Sanção CEIS'
      when 'cgu_cnep' then 'Sanção CNEP'
      when 'public_contract' then 'Contrato público identificado'
    end,
    case record.record_type
      when 'bndes_financing' then 76
      when 'pgfn_debt' then 84
      when 'cgu_ceis' then 88
      when 'cgu_cnep' then 88
      when 'public_contract' then 82
    end,
    96, true, record.source_url,
    coalesce(record.normalized_payload ->> 'summary', record.record_type),
    record.observed_at,
    jsonb_build_object(
      'publicRecordKey', record.record_key,
      'datasetCode', record.dataset_code,
      'sourceCode', record.source_code,
      'recordType', record.record_type,
      'entityCnpj', record.entity_cnpj,
      'referenceDate', record.reference_date,
      'amount', record.amount,
      'status', record.status
    ),
    case record.record_type
      when 'bndes_financing' then 76
      when 'pgfn_debt' then 84
      when 'cgu_ceis' then 88
      when 'cgu_cnep' then 88
      when 'public_contract' then 82
    end,
    0.96,
    jsonb_build_object(
      'label', replace(record.record_type, '_', ' '),
      'summary', coalesce(record.normalized_payload ->> 'summary', record.record_type),
      'sourceUrl', record.source_url,
      'datasetCode', record.dataset_code,
      'recordKey', record.record_key,
      'normalized', record.normalized_payload
    ),
    'observed', now(), now()
  from public.public_company_records record
  left join public.source_catalog source on source.metadata ->> 'code' = record.source_code
  left join public.monitoring_outputs output
    on output.company_id = record.company_id
   and output.source_id is not distinct from source.id
   and output.payload ->> 'publicRecordKey' = record.record_key
  where record.company_id is not null
    and record.record_type in ('bndes_financing','pgfn_debt','cgu_ceis','cgu_cnep','public_contract')
    and (p_dataset_code is null or record.dataset_code = p_dataset_code)
  on conflict do nothing;
  get diagnostics signals_count = row_count;

  with ranked as (
    select record.*,
      row_number() over (
        partition by record.company_id, record.entity_cnpj, record.record_type
        order by record.reference_date desc nulls last, record.observed_at desc
      ) as rn
    from public.public_company_records record
    where record.company_id is not null
      and record.record_type in ('rfb_company_snapshot','rfb_establishment_snapshot')
      and (p_dataset_code is null or record.dataset_code = p_dataset_code)
  ), changes as (
    select latest.*
    from ranked latest
    join ranked previous
      on previous.company_id = latest.company_id
     and previous.entity_cnpj = latest.entity_cnpj
     and previous.record_type = latest.record_type
     and previous.rn = 2
    where latest.rn = 1
      and latest.content_hash <> previous.content_hash
  )
  insert into public.company_signals (
    id, company_id, source_id, monitoring_output_id, signal_type, signal_label,
    strength, confidence, is_explicit, evidence_url, evidence_text, observed_at,
    metadata, signal_strength, confidence_score, evidence_payload,
    observed_vs_inferred, created_at, updated_at
  )
  select
    gen_random_uuid(), change.company_id, source.id, output.id,
    'corporate_structure_change', 'Mudança cadastral na Receita Federal',
    72, 96, true, change.source_url,
    coalesce(change.normalized_payload ->> 'summary', 'Mudança cadastral RFB'),
    change.observed_at,
    jsonb_build_object(
      'publicRecordKey', change.record_key,
      'datasetCode', change.dataset_code,
      'sourceCode', change.source_code,
      'recordType', change.record_type,
      'entityCnpj', change.entity_cnpj,
      'referenceDate', change.reference_date,
      'materialDiff', true
    ),
    72, 0.96,
    jsonb_build_object(
      'label', 'Mudança cadastral na Receita Federal',
      'summary', coalesce(change.normalized_payload ->> 'summary', 'Mudança cadastral RFB'),
      'sourceUrl', change.source_url,
      'datasetCode', change.dataset_code,
      'recordKey', change.record_key
    ),
    'observed', now(), now()
  from changes change
  left join public.source_catalog source on source.metadata ->> 'code' = change.source_code
  left join public.monitoring_outputs output
    on output.company_id = change.company_id
   and output.source_id is not distinct from source.id
   and output.payload ->> 'publicRecordKey' = change.record_key
  on conflict do nothing;
  get diagnostics rfb_count = row_count;
  signals_count := signals_count + rfb_count;

  return jsonb_build_object('outputs_written', outputs_count, 'signals_written', signals_count);
end;
$$;

grant execute on function public.sync_public_dataset_company_outputs(text) to service_role;
revoke execute on function public.sync_public_dataset_company_outputs(text) from anon, authenticated;
