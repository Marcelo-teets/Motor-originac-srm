-- Mirror-only Data Platform Fase 2 / Frente D.
-- Aplicada no banco vivo via Supabase MCP em 2026-06-11 (com estas correções).
-- Apply separately through Supabase MCP. Codex did not execute this DDL.
-- Purpose: formal bronze -> silver -> gold mapping for capture data.

create or replace view public.bronze_source_documents_raw as
select
  sd.id,
  sd.run_id,
  sd.company_id,
  sd.source_id,
  sd.document_type,
  sd.external_id,
  sd.canonical_url,
  sd.title,
  sd.published_at,
  sd.observed_at,
  sd.content_hash,
  sd.raw_payload,
  sd.normalized_payload,
  sd.extraction_status,
  sd.confidence_score,
  sc.name as source_name,
  sc.metadata->>'code' as source_code
from public.source_documents sd
left join public.source_catalog sc on sc.id = sd.source_id;

create or replace view public.bronze_company_signals_raw as
select
  cs.*,
  sc.name as source_name,
  sc.metadata->>'code' as source_code
from public.company_signals cs
left join public.source_catalog sc on sc.id = cs.source_id;

create or replace view public.bronze_monitoring_outputs_raw as
select
  mo.*,
  sc.name as source_name,
  sc.metadata->>'code' as source_code
from public.monitoring_outputs mo
left join public.source_catalog sc on sc.id = mo.source_id;

create or replace view public.silver_source_documents_deduped as
with ranked as (
  select
    b.*,
    row_number() over (
      partition by coalesce(nullif(b.content_hash, ''), nullif(b.canonical_url, ''), b.id)
      order by b.observed_at desc, b.id
    ) as rn
  from public.bronze_source_documents_raw b
)
select
  id,
  run_id,
  company_id,
  source_id,
  coalesce(source_code, source_id::text) as source_code,
  source_name,
  document_type,
  external_id,
  canonical_url,
  title,
  published_at,
  observed_at,
  content_hash,
  normalized_payload,
  extraction_status,
  confidence_score
from ranked
where rn = 1;

create or replace view public.silver_company_signals_normalized as
select
  cs.id,
  cs.company_id,
  cs.monitoring_output_id,
  cs.source_id,
  coalesce(sc.metadata->>'code', cs.source_id::text) as source_code,
  cs.signal_type,
  cs.signal_label,
  coalesce(cs.signal_strength, cs.strength, 0)::numeric as signal_strength,
  coalesce(cs.confidence_score, cs.confidence, 0)::numeric as confidence_score,
  cs.is_explicit,
  cs.evidence_url,
  cs.evidence_text,
  cs.observed_at,
  coalesce(cs.evidence_payload, cs.metadata, '{}'::jsonb) as evidence_payload,
  cs.observed_vs_inferred,
  cs.created_at
from public.company_signals cs
left join public.source_catalog sc on sc.id = cs.source_id;

create or replace view public.silver_monitoring_outputs_normalized as
select
  mo.id,
  mo.company_id,
  mo.source_id,
  coalesce(sc.metadata->>'code', mo.source_id::text) as source_code,
  mo.search_profile_id,
  mo.output_type,
  coalesce(mo.title, mo.output_payload->>'title') as title,
  coalesce(mo.url, mo.output_payload->>'sourceUrl', mo.normalized_payload->>'sourceUrl') as url,
  coalesce(mo.summary, mo.output_payload->>'summary') as summary,
  mo.observed_at,
  mo.processed_at,
  mo.status,
  coalesce(mo.confidence_score, mo.source_confidence, 0)::numeric as confidence_score,
  mo.connector_status,
  mo.observed_vs_inferred,
  coalesce(mo.normalized_payload, mo.output_payload, mo.payload, '{}'::jsonb) as normalized_payload
from public.monitoring_outputs mo
left join public.source_catalog sc on sc.id = mo.source_id;

create or replace view public.gold_company_signal_features as
select
  cs.company_id,
  regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g') as canonical_cnpj,
  coalesce(c.trade_name, c.legal_name) as company_name,
  cs.source_id,
  cs.source_code,
  coalesce(sc.metadata->>'tier', 'tier_5') as source_tier,
  cs.signal_type,
  cs.signal_label,
  cs.signal_strength,
  cs.confidence_score,
  round((cs.signal_strength * cs.confidence_score) / 100.0, 2) as feature_score,
  cs.observed_at,
  cs.evidence_url,
  cs.evidence_text,
  cs.evidence_payload
from public.silver_company_signals_normalized cs
join public.companies c on c.id = cs.company_id
left join public.source_catalog sc on sc.id = cs.source_id
where length(regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g')) = 14;

create or replace view public.gold_company_source_features as
select
  g.company_id,
  g.canonical_cnpj,
  g.company_name,
  g.source_id,
  g.source_code,
  g.source_tier,
  count(*)::integer as signal_count,
  coalesce(d.document_count, 0)::integer as document_count,
  max(g.feature_score) as max_feature_score,
  round(avg(g.confidence_score), 2) as avg_confidence_score,
  max(g.observed_at) as last_observed_at
from public.gold_company_signal_features g
left join (
  select company_id, source_id, count(*) as document_count
  from public.silver_source_documents_deduped
  group by company_id, source_id
) d on d.company_id = g.company_id and d.source_id = g.source_id
group by g.company_id, g.canonical_cnpj, g.company_name, g.source_id, g.source_code, g.source_tier, d.document_count;

create or replace view public.gold_company_profiles as
select
  c.id as company_id,
  regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g') as canonical_cnpj,
  coalesce(c.trade_name, c.legal_name) as company_name,
  -- Corrigido no vivo em 11/jun: count(g.signal_type) referenciava coluna inexistente.
  coalesce(sum(g.signal_count), 0)::integer as signal_count,
  count(distinct g.source_id)::integer as source_count,
  coalesce(sum(g.document_count), 0)::integer as document_count,
  max(g.last_observed_at) as latest_evidence_at,
  coalesce(max(g.max_feature_score), 0) as strongest_feature_score,
  coalesce(round(avg(g.avg_confidence_score), 2), 0) as avg_confidence_score
from public.companies c
left join public.gold_company_source_features g on g.company_id = c.id
where length(regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g')) = 14
group by c.id, c.cnpj, c.trade_name, c.legal_name;

comment on view public.bronze_source_documents_raw is 'Bronze: raw source document capture mapped from source_documents.';
comment on view public.silver_source_documents_deduped is 'Silver: normalized and deduped source_documents by hash/url/id.';
comment on view public.gold_company_signal_features is 'Gold: entity-resolved signal features keyed by canonical CNPJ/company_id.';
comment on view public.gold_company_profiles is 'Gold: feature-ready company profile aggregates for data platform readers.';
