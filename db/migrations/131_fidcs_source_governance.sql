-- FIDCS.com.br is a bounded secondary validation source. CVM remains canonical.

create unique index if not exists uq_source_catalog_metadata_code
  on public.source_catalog ((metadata ->> 'code'))
  where nullif(metadata ->> 'code', '') is not null;

insert into public.source_catalog (
  name, url, category, scope, priority, criticality, frequency, status,
  validation_rule, metadata, source_type, auth_requirement, rate_limit_notes, health
)
values (
  'FIDCS.com.br', 'https://fidcs.com.br/', 'funds_structured_data', 'BR', 2, 'high', 'on_demand', 'real',
  'Usar somente páginas públicas e estáveis para validar/enriquecer FIDCs por CNPJ. A CVM permanece canônica; divergências devem ser sinalizadas e nunca sobrescritas automaticamente. Não automatizar endpoints internos ou premium não documentados.',
  jsonb_build_object(
    'code', 'src_fidcs_com_br', 'provider', 'fidcs.com.br', 'official', false,
    'freePublicAccess', true, 'tier', 'tier_5_supplemental_enrichment',
    'sourceAuthority', 'derived_secondary', 'canonicalUpstream', 'CVM',
    'entityKey', 'fund_cnpj', 'captureMode', 'bounded_public_ssr_validation',
    'publicRoutes', jsonb_build_array('/fundos', '/fundo/{cnpj}'),
    'optionalPremiumSessionEnv', 'FIDCS_SESSION_COOKIE', 'premiumAutomationEnabled', false,
    'duplicatePolicy', 'do_not_promote_canonical_when_cvm_record_exists',
    'sourceConfidenceCap', 0.75, 'automaticScoreImpact', false,
    'implementedRuntime', true, 'implementationPhase', 'public_validation_runtime',
    'runtime', 'fidcs-com-br-v1', 'scheduler', 'manual_or_external_cron',
    'addedAt', '2026-07-28T00:00:00-03:00'
  ),
  'public_ssr_optional_premium', 'none_public_optional_session_for_premium',
  'Coleta limitada a até 10 fundos por execução; sem varredura integral; respeitar falhas e backoff do provedor.',
  'healthy'
)
on conflict ((metadata ->> 'code')) where nullif(metadata ->> 'code', '') is not null
  do update set
    name = excluded.name, url = excluded.url, category = excluded.category, scope = excluded.scope,
    priority = excluded.priority, criticality = excluded.criticality, frequency = excluded.frequency,
    status = excluded.status, validation_rule = excluded.validation_rule,
    metadata = public.source_catalog.metadata || excluded.metadata,
    source_type = excluded.source_type, auth_requirement = excluded.auth_requirement,
    rate_limit_notes = excluded.rate_limit_notes, health = excluded.health, updated_at = now();

update public.source_catalog
set health = 'standby',
    metadata = metadata || jsonb_build_object('operationalState', 'not_implemented', 'healthSemantics', 'standby_not_degraded'),
    updated_at = now()
where status = 'planned' and coalesce(health, '') = 'degraded';

with duplicates(code, superseded_by, reason) as (
  values
    ('src_brazil_journal_legacy_rss', 'src_brazil_journal_rss', 'RSS connector already covers the same publication'),
    ('src_startups_com_br_legacy_rss', 'src_startups_com_br_rss', 'RSS connector already covers the same publication'),
    ('src_pipeline_valor_legacy_rss', 'src_pipeline_valor_empresas_rss', 'RSS connector already covers the same publication'),
    ('src_querido_diario', 'src_querido_diario_api', 'Operational API supersedes planned duplicate'),
    ('src_pgfn_divida_ativa', 'src_pgfn_divida_ativa_bulk', 'Official bulk source is the canonical planned implementation'),
    ('src_bcb_sgs_credit_series', 'src_bcb_sgs', 'Credit series consolidated into the operational SGS connector'),
    ('src_cvm_fund_documents', 'src_cvm_fundos_documentos_entrega', 'Delivery metadata connector supersedes the broken duplicate runtime')
)
update public.source_catalog source
set status = 'retired', health = 'standby',
    metadata = source.metadata || jsonb_build_object(
      'operationalState', 'superseded', 'supersededBy', duplicates.superseded_by,
      'supersededReason', duplicates.reason, 'supersededAt', '2026-07-28T00:00:00-03:00'),
    updated_at = now()
from duplicates
where source.metadata ->> 'code' = duplicates.code;

update public.source_catalog
set metadata = metadata || jsonb_build_object(
      'creditSeries', jsonb_build_array(20714, 21082, 21112, 25434),
      'creditSeriesHistoryStart', '2000-01', 'creditSeriesBackfill', true,
      'consolidatedSourceCodes', jsonb_build_array('src_bcb_sgs_credit_series')),
    updated_at = now()
where metadata ->> 'code' = 'src_bcb_sgs';

update public.source_catalog
set health = case when coalesce((metadata ->> 'fallbackProbePassed')::boolean, false) then 'healthy' else health end,
    metadata = metadata || jsonb_build_object(
      'effectiveRuntime', case when coalesce((metadata ->> 'fallbackProbePassed')::boolean, false) then 'fallback_operational' else 'official_bulk_degraded' end,
      'healthRepresentsEffectiveRuntime', true),
    updated_at = now()
where metadata ->> 'code' = 'src_rfb_qsa_bulk';

create or replace function public.persist_fidcs_validation(p_snapshot jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source_id uuid;
  v_output_id uuid;
  v_record_key text;
  v_cnpj text;
  v_observed_at timestamptz;
begin
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then raise exception 'p_snapshot must be a JSON object'; end if;
  v_record_key := nullif(p_snapshot ->> 'publicRecordKey', '');
  v_cnpj := regexp_replace(coalesce(p_snapshot ->> 'cnpj', ''), '[^0-9]', '', 'g');
  v_observed_at := coalesce(nullif(p_snapshot ->> 'observedAt', '')::timestamptz, now());
  if v_record_key is null or length(v_cnpj) <> 14 then raise exception 'FIDCS snapshot requires publicRecordKey and a valid CNPJ'; end if;

  select id into v_source_id from public.source_catalog where metadata ->> 'code' = 'src_fidcs_com_br' limit 1;
  if v_source_id is null then raise exception 'FIDCS.com.br source is missing from source_catalog'; end if;

  select id into v_output_id
  from public.monitoring_outputs
  where source_id = v_source_id and payload ->> 'publicRecordKey' = v_record_key
  order by observed_at desc limit 1;

  if v_output_id is null then
    v_output_id := gen_random_uuid();
    insert into public.monitoring_outputs (
      id, company_id, source_id, output_type, title, url, raw_text, summary,
      observed_at, processed_at, status, source_confidence, payload,
      output_payload, normalized_payload, confidence_score,
      connector_status, observed_vs_inferred, created_at, updated_at
    ) values (
      v_output_id, null, v_source_id, 'fund_validation',
      concat('FIDCS.com.br · ', coalesce(p_snapshot ->> 'fundName', p_snapshot ->> 'legalName', v_cnpj)),
      p_snapshot ->> 'sourceUrl', null,
      concat_ws(' · ', coalesce(p_snapshot ->> 'fundName', p_snapshot ->> 'legalName'), p_snapshot ->> 'cnpjFormatted', p_snapshot ->> 'status',
        case when p_snapshot ? 'netAssetValueBrl' then concat('PL ', p_snapshot ->> 'netAssetValueBrl') end,
        case when p_snapshot ? 'defaultRatePercent' then concat('inadimplência ', p_snapshot ->> 'defaultRatePercent', '%') end),
      v_observed_at, now(), 'processed', 75,
      p_snapshot || jsonb_build_object('datasetCode', 'fidcs_com_br_public_validation', 'sourceCode', 'src_fidcs_com_br', 'publicRecordKey', v_record_key, 'canonicalUpstream', 'CVM', 'canonicalPromotionAllowed', false),
      jsonb_build_object('cnpj', v_cnpj, 'status', p_snapshot ->> 'status', 'manager', p_snapshot ->> 'manager', 'administrator', p_snapshot ->> 'administrator', 'netAssetValueBrl', p_snapshot -> 'netAssetValueBrl', 'shareholdersCount', p_snapshot -> 'shareholdersCount', 'defaultRatePercent', p_snapshot -> 'defaultRatePercent', 'pddPercent', p_snapshot -> 'pddPercent'),
      p_snapshot, 0.75, 'real', 'observed', now(), now()
    );
  else
    update public.monitoring_outputs
    set title = concat('FIDCS.com.br · ', coalesce(p_snapshot ->> 'fundName', p_snapshot ->> 'legalName', v_cnpj)),
        url = p_snapshot ->> 'sourceUrl',
        summary = concat_ws(' · ', coalesce(p_snapshot ->> 'fundName', p_snapshot ->> 'legalName'), p_snapshot ->> 'cnpjFormatted', p_snapshot ->> 'status',
          case when p_snapshot ? 'netAssetValueBrl' then concat('PL ', p_snapshot ->> 'netAssetValueBrl') end,
          case when p_snapshot ? 'defaultRatePercent' then concat('inadimplência ', p_snapshot ->> 'defaultRatePercent', '%') end),
        observed_at = v_observed_at, processed_at = now(), status = 'processed', source_confidence = 75,
        payload = p_snapshot || jsonb_build_object('datasetCode', 'fidcs_com_br_public_validation', 'sourceCode', 'src_fidcs_com_br', 'publicRecordKey', v_record_key, 'canonicalUpstream', 'CVM', 'canonicalPromotionAllowed', false),
        output_payload = jsonb_build_object('cnpj', v_cnpj, 'status', p_snapshot ->> 'status', 'manager', p_snapshot ->> 'manager', 'administrator', p_snapshot ->> 'administrator', 'netAssetValueBrl', p_snapshot -> 'netAssetValueBrl', 'shareholdersCount', p_snapshot -> 'shareholdersCount', 'defaultRatePercent', p_snapshot -> 'defaultRatePercent', 'pddPercent', p_snapshot -> 'pddPercent'),
        normalized_payload = p_snapshot, confidence_score = 0.75, connector_status = 'real', observed_vs_inferred = 'observed', updated_at = now()
    where id = v_output_id;
  end if;
  return v_output_id;
end;
$$;

revoke all on function public.persist_fidcs_validation(jsonb) from public, anon, authenticated;
grant execute on function public.persist_fidcs_validation(jsonb) to service_role;

create or replace function public.fidcs_runtime_status()
returns jsonb
language sql
security invoker
set search_path = public
as $$
  with source as (
    select id, name, status, health, metadata, updated_at from public.source_catalog where metadata ->> 'code' = 'src_fidcs_com_br' limit 1
  ), latest_run as (
    select run.* from public.source_connector_runs run join source on source.id = run.source_id order by run.started_at desc limit 1
  ), outputs as (
    select count(*)::integer as output_count, max(output.observed_at) as last_output_at
    from public.monitoring_outputs output join source on source.id = output.source_id
    where output.payload ->> 'sourceCode' = 'src_fidcs_com_br'
  )
  select jsonb_build_object(
    'status', coalesce(source.status, 'partial'), 'health', coalesce(source.health, 'degraded'),
    'sourceId', source.id, 'sourceName', source.name, 'canonicalUpstream', 'CVM',
    'sourceAuthority', 'derived_secondary', 'automaticScoreImpact', false,
    'outputCount', coalesce(outputs.output_count, 0), 'lastOutputAt', outputs.last_output_at,
    'lastRun', case when latest_run.id is null then null else jsonb_build_object(
      'id', latest_run.id, 'status', latest_run.status, 'startedAt', latest_run.started_at,
      'finishedAt', latest_run.finished_at, 'itemsCollected', latest_run.items_collected,
      'outputsWritten', latest_run.outputs_written, 'errorMessage', latest_run.error_message, 'metadata', latest_run.metadata) end,
    'metadata', source.metadata, 'updatedAt', source.updated_at)
  from source cross join outputs left join latest_run on true;
$$;

revoke all on function public.fidcs_runtime_status() from public, anon, authenticated;
grant execute on function public.fidcs_runtime_status() to service_role;

comment on function public.persist_fidcs_validation(jsonb) is 'Persists one lightweight FIDCS.com.br public validation snapshot without overriding canonical CVM records.';
comment on function public.fidcs_runtime_status() is 'Returns the operational status of the bounded FIDCS.com.br secondary validation connector.';
