-- Make monthly QSA fallback persistence idempotent without rewriting migration 098.

create or replace function public.persist_qsa_fallback_snapshot(
  p_company_id uuid,
  p_records jsonb,
  p_observed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies%rowtype;
  v_source public.source_catalog%rowtype;
  v_company_root text;
  v_bronze_written integer := 0;
  v_records_written integer := 0;
  v_outputs_written integer := 0;
  v_outputs_available integer := 0;
begin
  select * into v_company
  from public.companies
  where id = p_company_id;

  if not found then
    raise exception 'QSA fallback company not found.';
  end if;

  if coalesce(v_company.metadata ->> 'data_status', '') <> 'real'
     or coalesce((v_company.metadata ->> 'synthetic_seed')::boolean, false)
     or not coalesce((v_company.metadata ->> 'identity_verified')::boolean, false)
     or not coalesce((v_company.metadata ->> 'monitoring_eligible')::boolean, false)
     or coalesce((v_company.metadata ->> 'excluded_from_monitoring')::boolean, false)
     or not coalesce((v_company.metadata ->> 'entity_resolution_eligible')::boolean, true) then
    raise exception 'Company is not eligible for governed QSA monitoring.';
  end if;

  v_company_root := left(regexp_replace(coalesce(v_company.cnpj, ''), '[^0-9]', '', 'g'), 8);
  if length(v_company_root) <> 8 then
    raise exception 'Company does not have a valid CNPJ root.';
  end if;

  select * into v_source
  from public.source_catalog
  where metadata ->> 'code' = 'src_brasilapi_cnpj'
  limit 1;

  if not found then
    raise exception 'BrasilAPI source catalog entry was not found.';
  end if;

  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) = 0 then
    raise exception 'QSA fallback records must be a non-empty JSON array.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_records) item(record)
    where item.record ->> 'datasetCode' <> 'rfb_qsa'
       or item.record ->> 'sourceCode' <> 'src_brasilapi_cnpj'
       or item.record ->> 'recordType' <> 'rfb_partner_snapshot'
       or item.record ->> 'entityCnpj' <> v_company_root
       or item.record #>> '{normalizedPayload,sourceAuthority}' <> 'secondary_public_api'
       or item.record #>> '{normalizedPayload,sourceProvider}' <> 'BrasilAPI'
       or coalesce((item.record #>> '{normalizedPayload,sourceConfidence}')::numeric, 0) <= 0
       or coalesce((item.record #>> '{normalizedPayload,sourceConfidence}')::numeric, 0) > 0.85
       or item.record::text ~ '"[0-9]{11}"|"[0-9]{14}"'
  ) then
    raise exception 'QSA fallback record failed provenance, confidence, entity or privacy validation.';
  end if;

  insert into public.bronze_historical_records (
    dataset_code, record_key, ref_date, entity_cnpj, payload,
    source_url, content_hash, ingested_at
  )
  select
    item.record ->> 'datasetCode',
    item.record ->> 'recordKey',
    nullif(item.record ->> 'referenceDate', '')::date,
    item.record ->> 'entityCnpj',
    item.record -> 'rawPayload',
    item.record ->> 'sourceUrl',
    item.record ->> 'contentHash',
    p_observed_at
  from jsonb_array_elements(p_records) item(record)
  on conflict (dataset_code, record_key) do update
  set ref_date = excluded.ref_date,
      entity_cnpj = excluded.entity_cnpj,
      payload = excluded.payload,
      source_url = excluded.source_url,
      content_hash = excluded.content_hash,
      ingested_at = excluded.ingested_at;
  get diagnostics v_bronze_written = row_count;

  insert into public.public_company_records (
    dataset_code, source_code, record_key, company_id, entity_cnpj,
    entity_name, record_type, reference_date, amount, status,
    source_url, resource_key, content_hash, raw_payload,
    normalized_payload, observed_at, updated_at
  )
  select
    item.record ->> 'datasetCode',
    item.record ->> 'sourceCode',
    item.record ->> 'recordKey',
    p_company_id,
    item.record ->> 'entityCnpj',
    nullif(item.record ->> 'entityName', ''),
    item.record ->> 'recordType',
    nullif(item.record ->> 'referenceDate', '')::date,
    nullif(item.record ->> 'amount', '')::numeric,
    nullif(item.record ->> 'status', ''),
    item.record ->> 'sourceUrl',
    item.record ->> 'resourceKey',
    item.record ->> 'contentHash',
    item.record -> 'rawPayload',
    item.record -> 'normalizedPayload',
    p_observed_at,
    p_observed_at
  from jsonb_array_elements(p_records) item(record)
  on conflict (dataset_code, record_key) do update
  set company_id = excluded.company_id,
      entity_name = excluded.entity_name,
      status = excluded.status,
      source_url = excluded.source_url,
      resource_key = excluded.resource_key,
      content_hash = excluded.content_hash,
      raw_payload = excluded.raw_payload,
      normalized_payload = excluded.normalized_payload,
      observed_at = excluded.observed_at,
      updated_at = excluded.updated_at;
  get diagnostics v_records_written = row_count;

  insert into public.monitoring_outputs (
    id, company_id, source_id, search_profile_id, output_type, title, url,
    raw_text, summary, observed_at, processed_at, status, source_confidence,
    payload, created_at, updated_at, output_payload, normalized_payload,
    confidence_score, connector_status, observed_vs_inferred
  )
  select
    gen_random_uuid(),
    p_company_id,
    v_source.id,
    null,
    'public_dataset_record',
    concat('Quadro societário via BrasilAPI · ', coalesce(v_company.trade_name, v_company.legal_name)),
    item.record ->> 'sourceUrl',
    null,
    coalesce(item.record #>> '{normalizedPayload,summary}', 'Quadro societário consultado por API pública secundária'),
    p_observed_at,
    now(),
    'processed',
    least(0.85, greatest(0.10, coalesce((item.record #>> '{normalizedPayload,sourceConfidence}')::numeric, 0.78))),
    jsonb_build_object(
      'publicRecordKey', item.record ->> 'recordKey',
      'datasetCode', item.record ->> 'datasetCode',
      'sourceCode', item.record ->> 'sourceCode',
      'recordType', item.record ->> 'recordType',
      'entityCnpj', item.record ->> 'entityCnpj',
      'referenceDate', item.record ->> 'referenceDate',
      'resourceKey', item.record ->> 'resourceKey',
      'contentHash', item.record ->> 'contentHash',
      'sourceAuthority', item.record #>> '{normalizedPayload,sourceAuthority}',
      'fallbackReason', 'official_bulk_unavailable'
    ),
    now(),
    now(),
    item.record -> 'rawPayload',
    item.record -> 'normalizedPayload',
    least(0.85, greatest(0.10, coalesce((item.record #>> '{normalizedPayload,sourceConfidence}')::numeric, 0.78))),
    'real',
    'observed'
  from jsonb_array_elements(p_records) item(record)
  where not exists (
    select 1
    from public.monitoring_outputs existing
    where existing.company_id = p_company_id
      and existing.source_id = v_source.id
      and existing.payload ->> 'publicRecordKey' = item.record ->> 'recordKey'
  );
  get diagnostics v_outputs_written = row_count;

  select count(*) into v_outputs_available
  from public.monitoring_outputs existing
  where existing.company_id = p_company_id
    and existing.source_id = v_source.id
    and existing.payload ->> 'publicRecordKey' in (
      select item.record ->> 'recordKey'
      from jsonb_array_elements(p_records) item(record)
    );

  update public.source_catalog
  set name = 'BrasilAPI CNPJ',
      category = 'public_api_cadastral',
      status = 'real',
      health = 'healthy',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'code', 'src_brasilapi_cnpj',
        'provider', 'BrasilAPI',
        'sourceAuthority', 'secondary_public_api',
        'tier', 'tier_2_public_secondary',
        'qsaFallbackEnabled', true,
        'qsaFallbackConfidence', 0.78,
        'lastQsaFallbackRunAt', p_observed_at,
        'lastQsaFallbackCompanyId', p_company_id,
        'lastQsaFallbackRecords', jsonb_array_length(p_records),
        'officialSourceSupersedesFallback', true
      ),
      updated_at = now()
  where id = v_source.id;

  return jsonb_build_object(
    'status', 'completed',
    'companyId', p_company_id,
    'sourceCode', 'src_brasilapi_cnpj',
    'sourceAuthority', 'secondary_public_api',
    'bronzeRowsWritten', v_bronze_written,
    'recordsWritten', v_records_written,
    'outputsWritten', v_outputs_written,
    'outputsAvailable', v_outputs_available,
    'signalsWritten', 0,
    'observedAt', p_observed_at
  );
end;
$$;

revoke all on function public.persist_qsa_fallback_snapshot(uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.persist_qsa_fallback_snapshot(uuid, jsonb, timestamptz) to service_role;
