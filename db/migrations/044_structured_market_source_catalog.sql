-- 044_structured_market_source_catalog.sql
-- Activates the structured-credit source pack in the canonical UUID source catalog.
-- Logical identity remains metadata.code so the migration is replayable across environments.

with source_pack(code, name, source_type, category, auth_requirement, status, health, base_url, cadence, capture_mode, rate_limit_notes) as (
  values
    ('src_cvm_fundos_estruturados_medidas', 'CVM Fundos Estruturados: Medidas', 'dataset_http', 'Fundos estruturados', null, 'partial', 'degraded', 'https://dados.cvm.gov.br/dataset/fie-medidas', 'weekly', 'catalog_only', 'Official source catalogued; runtime loader is pending.'),
    ('src_cvm_fundos_documentos_entrega', 'CVM Fundos de Investimento: Documentos: Entrega', 'dataset_http', 'Regulatório', null, 'partial', 'degraded', 'https://dados.cvm.gov.br/dataset/fi-doc-entrega', 'weekly', 'catalog_only', 'Official source catalogued; runtime loader is pending.'),
    ('src_anbima_fundos_estruturados', 'ANBIMA API Fundos Estruturados', 'api', 'Fundos estruturados', 'client credentials / token ANBIMA', 'partial', 'degraded', 'https://api.anbima.com.br/feed/fundos/v1/fundos-estruturados', 'weekly', 'authenticated_api', 'Connector implemented; real capture depends on ANBIMA credentials.'),
    ('src_anbima_fundos_icvm_555', 'ANBIMA API Fundos ICVM 555', 'api', 'Fundos estruturados', 'client credentials / token ANBIMA', 'partial', 'degraded', 'https://api.anbima.com.br/feed/fundos/v1/fundos', 'weekly', 'authenticated_api', 'Complementary authenticated universe.'),
    ('src_infosimples_cvm_participante', 'Infosimples API CVM Participante', 'rpa_api', 'Prestadores', 'token Infosimples', 'partial', 'degraded', 'https://infosimples.com/consultas/cvm-participante/', 'on_demand', 'authenticated_api', 'Optional tokened enrichment for regulated participants.'),
    ('src_portal_transparencia_api', 'Portal da Transparência API', 'api', 'Setor público', 'token Portal da Transparência', 'partial', 'degraded', 'https://portaldatransparencia.gov.br/api-de-dados', 'on_demand', 'authenticated_api', 'Provider exposure and public contracts; token required.')
)
update public.source_catalog sc
set
  name = sp.name,
  source_type = sp.source_type,
  category = sp.category,
  auth_requirement = sp.auth_requirement,
  status = sp.status,
  health = sp.health,
  rate_limit_notes = sp.rate_limit_notes,
  metadata = coalesce(sc.metadata, '{}'::jsonb) || jsonb_build_object(
    'code', sp.code,
    'provider', case
      when sp.code like 'src_cvm_%' then 'CVM'
      when sp.code like 'src_anbima_%' then 'ANBIMA'
      when sp.code like 'src_infosimples_%' then 'Infosimples'
      else 'Governo Federal'
    end,
    'baseUrl', sp.base_url,
    'cadence', sp.cadence,
    'captureMode', sp.capture_mode,
    'coverage', 'structured_credit_market',
    'targetSignals', jsonb_build_array('existing_fidc', 'structured_funding_maturity', 'market_comparables'),
    'targetOutputTables', jsonb_build_array('fidc_dataset_runs', 'fidc_funds', 'monitoring_outputs')
  ),
  updated_at = now()
from source_pack sp
where sc.metadata->>'code' = sp.code;

with source_pack(code, name, source_type, category, auth_requirement, status, health, base_url, cadence, capture_mode, rate_limit_notes) as (
  values
    ('src_cvm_fundos_estruturados_medidas', 'CVM Fundos Estruturados: Medidas', 'dataset_http', 'Fundos estruturados', null, 'partial', 'degraded', 'https://dados.cvm.gov.br/dataset/fie-medidas', 'weekly', 'catalog_only', 'Official source catalogued; runtime loader is pending.'),
    ('src_cvm_fundos_documentos_entrega', 'CVM Fundos de Investimento: Documentos: Entrega', 'dataset_http', 'Regulatório', null, 'partial', 'degraded', 'https://dados.cvm.gov.br/dataset/fi-doc-entrega', 'weekly', 'catalog_only', 'Official source catalogued; runtime loader is pending.'),
    ('src_anbima_fundos_estruturados', 'ANBIMA API Fundos Estruturados', 'api', 'Fundos estruturados', 'client credentials / token ANBIMA', 'partial', 'degraded', 'https://api.anbima.com.br/feed/fundos/v1/fundos-estruturados', 'weekly', 'authenticated_api', 'Connector implemented; real capture depends on ANBIMA credentials.'),
    ('src_anbima_fundos_icvm_555', 'ANBIMA API Fundos ICVM 555', 'api', 'Fundos estruturados', 'client credentials / token ANBIMA', 'partial', 'degraded', 'https://api.anbima.com.br/feed/fundos/v1/fundos', 'weekly', 'authenticated_api', 'Complementary authenticated universe.'),
    ('src_infosimples_cvm_participante', 'Infosimples API CVM Participante', 'rpa_api', 'Prestadores', 'token Infosimples', 'partial', 'degraded', 'https://infosimples.com/consultas/cvm-participante/', 'on_demand', 'authenticated_api', 'Optional tokened enrichment for regulated participants.'),
    ('src_portal_transparencia_api', 'Portal da Transparência API', 'api', 'Setor público', 'token Portal da Transparência', 'partial', 'degraded', 'https://portaldatransparencia.gov.br/api-de-dados', 'on_demand', 'authenticated_api', 'Provider exposure and public contracts; token required.')
)
insert into public.source_catalog (
  name,
  source_type,
  category,
  auth_requirement,
  status,
  metadata,
  rate_limit_notes,
  health
)
select
  sp.name,
  sp.source_type,
  sp.category,
  sp.auth_requirement,
  sp.status,
  jsonb_build_object(
    'code', sp.code,
    'provider', case
      when sp.code like 'src_cvm_%' then 'CVM'
      when sp.code like 'src_anbima_%' then 'ANBIMA'
      when sp.code like 'src_infosimples_%' then 'Infosimples'
      else 'Governo Federal'
    end,
    'baseUrl', sp.base_url,
    'cadence', sp.cadence,
    'captureMode', sp.capture_mode,
    'coverage', 'structured_credit_market',
    'targetSignals', jsonb_build_array('existing_fidc', 'structured_funding_maturity', 'market_comparables'),
    'targetOutputTables', jsonb_build_array('fidc_dataset_runs', 'fidc_funds', 'monitoring_outputs')
  ),
  sp.rate_limit_notes,
  sp.health
from source_pack sp
where not exists (
  select 1
  from public.source_catalog sc
  where sc.metadata->>'code' = sp.code
);

-- Source telemetry is aggregated in Postgres so the UI does not download the
-- full monitoring corpus. Both the legacy and canonical payload contracts are
-- read during the migration period.
create or replace function public.try_parse_timestamptz_v1(value text)
returns timestamptz
language plpgsql
stable
as $$
begin
  if value is null or btrim(value) = '' then return null; end if;
  return value::timestamptz;
exception when others then
  return null;
end;
$$;

create or replace view public.source_intelligence_metrics_v1
with (security_invoker = true)
as
with normalized as (
  select
    mo.source_id,
    mo.company_id,
    coalesce(mo.processed_at, mo.observed_at, mo.created_at) as captured_at,
    coalesce(mo.observed_at, mo.created_at) as observed_at,
    coalesce(nullif(mo.normalized_payload, '{}'::jsonb), nullif(mo.payload, '{}'::jsonb), '{}'::jsonb) as evidence_payload,
    coalesce(
      mo.payload->>'connectorStatus',
      mo.normalized_payload->>'connectorStatus',
      case
        when mo.normalized_payload <> '{}'::jsonb or mo.output_payload <> '{}'::jsonb
          then mo.connector_status
        else null
      end,
      case when mo.status = 'processed' then 'real' else 'partial' end
    ) as resolved_connector_status,
    coalesce(mo.output_payload->>'summary', mo.summary, mo.raw_text, '') as evidence_summary,
    case
      when mo.normalized_payload <> '{}'::jsonb or mo.output_payload <> '{}'::jsonb then
        coalesce(
          mo.confidence_score,
          case when mo.source_confidence > 1 then mo.source_confidence / 100.0 else mo.source_confidence end,
          0
        )
      else
        coalesce(
          case
            when (mo.payload->>'confidenceScore') ~ '^[0-9]+(\.[0-9]+)?$'
              then (mo.payload->>'confidenceScore')::numeric
            else null
          end,
          case when mo.source_confidence > 1 then mo.source_confidence / 100.0 else mo.source_confidence end,
          mo.confidence_score,
          0
        )
    end as confidence_score
  from public.monitoring_outputs mo
), classified as (
  select
    n.*,
    coalesce(
      public.try_parse_timestamptz_v1(n.evidence_payload->'items'->0->>'publishedAt'),
      public.try_parse_timestamptz_v1(n.evidence_payload->>'publishedAt'),
      n.observed_at
    ) as evidence_at,
    n.resolved_connector_status = 'real'
      and coalesce(n.evidence_payload->>'error', '') = ''
      and lower(coalesce(n.evidence_payload->>'fallback', 'false')) <> 'true'
      and case
        when n.evidence_payload ? 'items' then
          jsonb_typeof(n.evidence_payload->'items') = 'array'
          and jsonb_array_length(n.evidence_payload->'items') > 0
          and exists (
            select 1
            from jsonb_array_elements(n.evidence_payload->'items') item
            where length(trim(concat_ws(' ', item->>'title', item->>'description', item->>'summary', item->>'snippet'))) > 0
          )
        when n.evidence_payload ? 'rows' then
          jsonb_typeof(n.evidence_payload->'rows') = 'array'
          and jsonb_array_length(n.evidence_payload->'rows') > 0
        when n.evidence_payload ? 'resources' then
          jsonb_typeof(n.evidence_payload->'resources') = 'array'
          and jsonb_array_length(n.evidence_payload->'resources') > 0
        when n.evidence_payload ? 'payload' then
          jsonb_typeof(n.evidence_payload->'payload') = 'object'
          and n.evidence_payload->'payload' <> '{}'::jsonb
          and lower(coalesce(n.evidence_payload->'payload'->>'fallback', 'false')) <> 'true'
          and coalesce(n.evidence_payload->'payload'->>'error', '') = ''
        when n.evidence_payload ? 'bodyText' or n.evidence_payload ? 'headings' then
          length(trim(coalesce(n.evidence_payload->>'bodyText', ''))) > 0
          or (
            jsonb_typeof(n.evidence_payload->'headings') = 'array'
            and jsonb_array_length(n.evidence_payload->'headings') > 0
          )
        else
          length(trim(n.evidence_summary)) > 0
          and n.evidence_summary !~* 'sem conte[uú]do|sem evid[eê]ncia|fallback|empty[_ ]feed'
      end as is_probative
  from normalized n
), global_coverage as (
  select count(distinct company_id)::bigint as companies_covered
  from classified
  where is_probative
)
select
  c.source_id::text as source_id,
  count(*)::bigint as capture_records_total,
  count(*) filter (where c.captured_at >= now() - interval '30 days')::bigint as capture_records_30d,
  count(*) filter (where c.is_probative)::bigint as outputs_total,
  count(*) filter (where c.is_probative and c.evidence_at >= now() - interval '24 hours')::bigint as outputs_24h,
  count(*) filter (where c.is_probative and c.evidence_at >= now() - interval '30 days')::bigint as outputs_30d,
  count(distinct c.company_id) filter (where c.is_probative)::bigint as companies_covered,
  round(avg(c.confidence_score) filter (where c.is_probative), 4) as average_confidence,
  max(c.captured_at) as last_capture_at,
  max(c.evidence_at) filter (where c.is_probative) as last_observed_at,
  gc.companies_covered as global_companies_covered
from classified c
cross join global_coverage gc
group by c.source_id, gc.companies_covered;

grant select on public.source_intelligence_metrics_v1 to authenticated, service_role;

create or replace view public.company_intelligence_metrics_v1
with (security_invoker = true)
as
with normalized_outputs as (
  select
    mo.id,
    mo.company_id,
    coalesce(mo.processed_at, mo.observed_at, mo.created_at) as captured_at,
    coalesce(mo.observed_at, mo.created_at) as observed_at,
    coalesce(nullif(mo.normalized_payload, '{}'::jsonb), nullif(mo.payload, '{}'::jsonb), '{}'::jsonb) as evidence_payload,
    coalesce(
      mo.payload->>'connectorStatus',
      mo.normalized_payload->>'connectorStatus',
      case
        when mo.normalized_payload <> '{}'::jsonb or mo.output_payload <> '{}'::jsonb then mo.connector_status
        else null
      end,
      case when mo.status = 'processed' then 'real' else 'partial' end
    ) as resolved_connector_status,
    coalesce(mo.output_payload->>'summary', mo.summary, mo.raw_text, '') as evidence_summary
  from public.monitoring_outputs mo
), evidence_records as (
  select
    n.*,
    coalesce(
      public.try_parse_timestamptz_v1(n.evidence_payload->'items'->0->>'publishedAt'),
      public.try_parse_timestamptz_v1(n.evidence_payload->>'publishedAt'),
      n.observed_at
    ) as evidence_at,
    n.resolved_connector_status = 'real'
      and coalesce(n.evidence_payload->>'error', '') = ''
      and lower(coalesce(n.evidence_payload->>'fallback', 'false')) <> 'true'
      and case
        when n.evidence_payload ? 'items' then
          jsonb_typeof(n.evidence_payload->'items') = 'array'
          and jsonb_array_length(n.evidence_payload->'items') > 0
          and exists (
            select 1 from jsonb_array_elements(n.evidence_payload->'items') item
            where length(trim(concat_ws(' ', item->>'title', item->>'description', item->>'summary', item->>'snippet'))) > 0
          )
        when n.evidence_payload ? 'rows' then
          jsonb_typeof(n.evidence_payload->'rows') = 'array' and jsonb_array_length(n.evidence_payload->'rows') > 0
        when n.evidence_payload ? 'resources' then
          jsonb_typeof(n.evidence_payload->'resources') = 'array' and jsonb_array_length(n.evidence_payload->'resources') > 0
        when n.evidence_payload ? 'payload' then
          jsonb_typeof(n.evidence_payload->'payload') = 'object'
          and n.evidence_payload->'payload' <> '{}'::jsonb
          and lower(coalesce(n.evidence_payload->'payload'->>'fallback', 'false')) <> 'true'
          and coalesce(n.evidence_payload->'payload'->>'error', '') = ''
        when n.evidence_payload ? 'bodyText' or n.evidence_payload ? 'headings' then
          length(trim(coalesce(n.evidence_payload->>'bodyText', ''))) > 0
          or (jsonb_typeof(n.evidence_payload->'headings') = 'array' and jsonb_array_length(n.evidence_payload->'headings') > 0)
        else
          length(trim(n.evidence_summary)) > 0
          and n.evidence_summary !~* 'sem conte[uú]do|sem evid[eê]ncia|fallback|empty[_ ]feed'
      end as is_probative
  from normalized_outputs n
), output_aggregate as (
  select
    company_id,
    count(*) filter (where is_probative and evidence_at >= now() - interval '24 hours')::bigint as outputs_24h,
    max(captured_at) as last_capture_at,
    max(evidence_at) filter (where is_probative) as latest_evidence_at,
    (array_agg(evidence_summary order by evidence_at desc) filter (where is_probative))[1] as latest_evidence_summary
  from evidence_records
  group by company_id
), normalized_signals as (
  select
    cs.company_id,
    coalesce(cs.observed_at, cs.created_at) as signal_at,
    case
      when cs.evidence_payload <> '{}'::jsonb then coalesce(cs.signal_strength, 0)
      else coalesce(cs.strength, cs.signal_strength, 0)
    end as signal_strength,
    coalesce(nullif(cs.evidence_payload, '{}'::jsonb), nullif(cs.metadata, '{}'::jsonb), '{}'::jsonb) as evidence_payload
  from public.company_signals cs
), signal_aggregate as (
  select
    signal.company_id,
    count(*)::bigint as triggers_24h
  from normalized_signals signal
  left join evidence_records evidence
    on evidence.id::text = signal.evidence_payload->>'outputId'
  where signal.signal_at >= now() - interval '24 hours'
    and signal.signal_strength >= 65
    and (
      coalesce(signal.evidence_payload->>'outputId', '') = ''
      or evidence.is_probative = true
    )
    and coalesce(signal.evidence_payload->>'note', signal.evidence_payload->>'summary', '')
      !~* 'rss fallback|empty[_ ]feed|sem evid[eê]ncia|unknown_error'
  group by signal.company_id
)
select
  coalesce(outputs.company_id, signals.company_id)::text as company_id,
  coalesce(outputs.outputs_24h, 0)::bigint as outputs_24h,
  coalesce(signals.triggers_24h, 0)::bigint as triggers_24h,
  outputs.last_capture_at,
  outputs.latest_evidence_at,
  outputs.latest_evidence_summary
from output_aggregate outputs
full outer join signal_aggregate signals
  on signals.company_id = outputs.company_id;

grant select on public.company_intelligence_metrics_v1 to authenticated, service_role;

-- Stable content IDs are upserted on repeat captures. Preserve the first
-- observation timestamp while processed_at continues to record the latest
-- collection, preventing unchanged pages/articles from looking newly observed.
create or replace function public.preserve_monitoring_observation_v1()
returns trigger
language plpgsql
as $$
begin
  new.created_at := old.created_at;
  new.observed_at := coalesce(old.observed_at, new.observed_at);
  return new;
end;
$$;

drop trigger if exists trg_preserve_monitoring_observation_v1 on public.monitoring_outputs;
create trigger trg_preserve_monitoring_observation_v1
before update on public.monitoring_outputs
for each row execute function public.preserve_monitoring_observation_v1();

create or replace function public.preserve_company_signal_observation_v1()
returns trigger
language plpgsql
as $$
begin
  new.created_at := old.created_at;
  new.observed_at := coalesce(old.observed_at, new.observed_at);
  return new;
end;
$$;

drop trigger if exists trg_preserve_company_signal_observation_v1 on public.company_signals;
create trigger trg_preserve_company_signal_observation_v1
before update on public.company_signals
for each row execute function public.preserve_company_signal_observation_v1();

-- company_patterns is current state, not an append-only event stream. Keep one
-- row per company/pattern so recurring captures cannot inflate ranking impact.
with duplicates as (
  select
    id,
    row_number() over (
      partition by company_id, pattern_id
      order by coalesce(detected_at, created_at) desc nulls last, id desc
    ) as row_number
  from public.company_patterns
)
delete from public.company_patterns target
using duplicates
where target.id = duplicates.id
  and duplicates.row_number > 1;

create unique index if not exists uq_company_patterns_current
  on public.company_patterns(company_id, pattern_id);
