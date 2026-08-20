-- Entity Relevance Gate v3 — historical analytical remediation
--
-- Purpose:
-- - preserve raw monitoring_outputs/source_documents/data_treatment_results;
-- - quarantine only derived company_signals that are demonstrably not company-specific;
-- - remove those invalid analytical signals so Factor Map observations cascade away;
-- - enqueue affected companies for canonical Factor Map / origination brief rebuild.
--
-- The matching rules intentionally mirror captureEntityRelevanceGate.ts:
-- deterministic company aliases + strict aggregator item grounding + macro/context separation.

create temporary table tmp_entity_relevance_v3_company_aliases (
  company_id uuid not null,
  alias_norm text not null,
  alias_compact text not null,
  primary key (company_id, alias_norm)
) on commit drop;

with normalized_companies as (
  select
    c.id as company_id,
    btrim(regexp_replace(translate(lower(coalesce(c.trade_name,'')),
      'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]+', ' ', 'g')) as trade_norm,
    btrim(regexp_replace(translate(lower(coalesce(c.legal_name,'')),
      'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]+', ' ', 'g')) as legal_norm,
    regexp_replace(translate(lower(coalesce(c.website,c.website_url,c.domain,'')),
      'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '^https?://(www\.)?', '', 'g') as website_hostish,
    case
      when coalesce(c.trade_name,c.legal_name,'') ~ '[-–—]' then
        btrim(regexp_replace(translate(lower(regexp_replace(coalesce(c.trade_name,c.legal_name,''), '^.*[-–—]\s*', '')),
          'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]+', ' ', 'g'))
      else ''
    end as separator_alias
  from public.companies c
), aliases_raw as (
  select nc.company_id, btrim(a.alias_value) as alias_norm
  from normalized_companies nc
  cross join lateral (
    values
      (nc.trade_norm),
      (nc.legal_norm),
      (regexp_replace(nc.trade_norm, '\s+(s a|sa|ltda|limitada|eireli|spe|s c|sc)\s*$', '', 'g')),
      (regexp_replace(nc.legal_norm, '\s+(s a|sa|ltda|limitada|eireli|spe|s c|sc)\s*$', '', 'g')),
      (regexp_replace(regexp_replace(nc.trade_norm, '\s+(s a|sa|ltda|limitada|eireli|spe|s c|sc)\s*$', '', 'g'), '^(grupo|group|companhia|cia)\s+', '', 'g')),
      (regexp_replace(regexp_replace(nc.legal_norm, '\s+(s a|sa|ltda|limitada|eireli|spe|s c|sc)\s*$', '', 'g'), '^(grupo|group|companhia|cia)\s+', '', 'g')),
      (nc.separator_alias),
      (split_part(split_part(nc.website_hostish, '/', 1), '.', 1))
  ) as a(alias_value)
)
insert into tmp_entity_relevance_v3_company_aliases(company_id, alias_norm, alias_compact)
select distinct
  ar.company_id,
  ar.alias_norm,
  regexp_replace(ar.alias_norm, '\s+', '', 'g') as alias_compact
from aliases_raw ar
where length(regexp_replace(ar.alias_norm, '\s+', '', 'g')) >= 3
on conflict do nothing;

create temporary table tmp_entity_relevance_v3_quarantine (
  signal_id uuid primary key,
  company_id uuid not null,
  source_id uuid,
  monitoring_output_id uuid,
  quarantine_reason text not null,
  source_code text,
  source_category text,
  signal_json jsonb not null
) on commit drop;

with signal_context as (
  select
    cs.id as signal_id,
    cs.company_id,
    cs.source_id,
    cs.monitoring_output_id,
    cs.signal_type,
    cs.evidence_text,
    cs.metadata,
    to_jsonb(cs) as signal_json,
    mo.normalized_payload,
    lower(coalesce(mo.normalized_payload->>'sourceCode','')) as source_code,
    lower(coalesce(mo.normalized_payload->>'sourceCategory','')) as source_category,
    btrim(regexp_replace(translate(lower(coalesce(cs.evidence_text,'')),
      'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]+', ' ', 'g')) as evidence_norm,
    regexp_replace(translate(lower(coalesce(cs.evidence_text,'')),
      'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]+', '', 'g') as evidence_compact,
    regexp_replace(coalesce(c.cnpj,''), '\D', '', 'g') as cnpj_digits
  from public.company_signals cs
  join public.companies c on c.id = cs.company_id
  left join public.monitoring_outputs mo on mo.id = cs.monitoring_output_id
  where cs.signal_type <> 'origination_brief'
), assessed as (
  select
    sc.*,
    (
      exists (
        select 1
        from tmp_entity_relevance_v3_company_aliases a
        where a.company_id = sc.company_id
          and (
            (' ' || sc.evidence_norm || ' ') like '% ' || a.alias_norm || ' %'
            or (length(a.alias_compact) >= 5 and position(a.alias_compact in sc.evidence_compact) > 0)
          )
      )
      or (
        length(sc.cnpj_digits) = 14
        and regexp_replace(coalesce(sc.evidence_text,''), '\D', '', 'g') like '%' || sc.cnpj_digits || '%'
      )
    ) as evidence_matches_company,
    exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(sc.normalized_payload->'items') = 'array'
          then sc.normalized_payload->'items'
          else '[]'::jsonb
        end
      ) item
      cross join lateral (
        select
          btrim(regexp_replace(translate(lower(concat_ws(' ', item->>'title', item->>'description', item->>'summary', item->>'content')),
            'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]+', ' ', 'g')) as item_norm,
          regexp_replace(translate(lower(concat_ws(' ', item->>'title', item->>'description', item->>'summary', item->>'content')),
            'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]+', '', 'g') as item_compact,
          regexp_replace(concat_ws(' ', item->>'title', item->>'description', item->>'summary', item->>'content'), '\D', '', 'g') as item_digits
      ) it
      where
        exists (
          select 1
          from tmp_entity_relevance_v3_company_aliases a
          where a.company_id = sc.company_id
            and (
              (' ' || it.item_norm || ' ') like '% ' || a.alias_norm || ' %'
              or (length(a.alias_compact) >= 5 and position(a.alias_compact in it.item_compact) > 0)
            )
        )
        or (length(sc.cnpj_digits) = 14 and position(sc.cnpj_digits in it.item_digits) > 0)
    ) as has_company_item,
    exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(sc.normalized_payload->'items') = 'array'
          then sc.normalized_payload->'items'
          else '[]'::jsonb
        end
      ) item
      cross join lateral (
        select
          btrim(regexp_replace(translate(lower(concat_ws(' ', item->>'title', item->>'description', item->>'summary', item->>'content')),
            'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]+', ' ', 'g')) as item_norm,
          regexp_replace(translate(lower(concat_ws(' ', item->>'title', item->>'description', item->>'summary', item->>'content')),
            'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]+', '', 'g') as item_compact,
          regexp_replace(concat_ws(' ', item->>'title', item->>'description', item->>'summary', item->>'content'), '\D', '', 'g') as item_digits
      ) it
      where (
        exists (
          select 1
          from tmp_entity_relevance_v3_company_aliases a
          where a.company_id = sc.company_id
            and (
              (' ' || it.item_norm || ' ') like '% ' || a.alias_norm || ' %'
              or (length(a.alias_compact) >= 5 and position(a.alias_compact in it.item_compact) > 0)
            )
        )
        or (length(sc.cnpj_digits) = 14 and position(sc.cnpj_digits in it.item_digits) > 0)
      )
      and exists (
        select 1
        from jsonb_array_elements_text(
          case when jsonb_typeof(sc.metadata->'keywords') = 'array'
            then sc.metadata->'keywords'
            else '[]'::jsonb
          end
        ) kw
        cross join lateral (
          select btrim(regexp_replace(translate(lower(kw),
            'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]+', ' ', 'g')) as kw_norm
        ) k
        where length(k.kw_norm) >= 3
          and (' ' || it.item_norm || ' ') like '% ' || k.kw_norm || ' %'
      )
    ) as has_company_keyword_item
  from signal_context sc
), classified as (
  select
    a.*,
    case
      when a.source_code in ('src_bcb_sgs','src_bcb_sgs_credit_series','src_mais_retorno_api')
        or a.source_category = 'macro_context'
        then 'market_context_not_company_evidence'
      when (
        a.source_code like '%_rss'
        or a.source_category like '%news%'
        or a.source_category like '%vc_portfolio%'
      )
        and a.metadata->>'treatmentVersion' = 'capture_treatment_v2'
        and (not a.has_company_item or not a.has_company_keyword_item)
        then 'treatment_signal_not_grounded_in_company_item'
      when (
        a.source_code like '%_rss'
        or a.source_category like '%news%'
        or a.source_category like '%vc_portfolio%'
      )
        and coalesce(a.metadata->>'treatmentVersion','') <> 'capture_treatment_v2'
        and not a.evidence_matches_company
        then 'aggregator_signal_entity_mismatch'
      else null
    end as quarantine_reason
  from assessed a
)
insert into tmp_entity_relevance_v3_quarantine(
  signal_id,
  company_id,
  source_id,
  monitoring_output_id,
  quarantine_reason,
  source_code,
  source_category,
  signal_json
)
select
  signal_id,
  company_id,
  source_id,
  monitoring_output_id,
  quarantine_reason,
  source_code,
  source_category,
  signal_json
from classified
where quarantine_reason is not null;

-- Preserve a complete audit copy of every analytical signal removed by this remediation.
insert into public.data_quality_violations(
  id,
  rule_code,
  entity_table,
  entity_id,
  source_id,
  severity,
  status,
  reason,
  observed_value,
  detected_at,
  resolved_at
)
select
  gen_random_uuid(),
  'ENTITY_RELEVANCE_V3_QUARANTINE',
  'company_signals',
  q.signal_id::text,
  q.source_id,
  case when q.quarantine_reason = 'market_context_not_company_evidence' then 'warning' else 'high' end,
  'resolved',
  q.quarantine_reason,
  jsonb_build_object(
    'remediation_version', 'entity_relevance_v3',
    'quarantine_reason', q.quarantine_reason,
    'company_id', q.company_id,
    'monitoring_output_id', q.monitoring_output_id,
    'source_code', q.source_code,
    'source_category', q.source_category,
    'signal', q.signal_json
  ),
  now(),
  now()
from tmp_entity_relevance_v3_quarantine q
where not exists (
  select 1
  from public.data_quality_violations d
  where d.rule_code = 'ENTITY_RELEVANCE_V3_QUARANTINE'
    and d.entity_table = 'company_signals'
    and d.entity_id = q.signal_id::text
);

-- company_signals are analytical artifacts, not the raw capture layer.
-- Their Factor Map observations cascade by FK; monitoring_outputs/documents/treatment audit are untouched.
delete from public.company_signals cs
using tmp_entity_relevance_v3_quarantine q
where cs.id = q.signal_id;

-- Rebuild current canonical analytical state for every affected company using the existing queue.
select public.enqueue_company_origination_reprocessing(
  q.company_id,
  'entity_relevance_v3_historical_remediation'
)
from (
  select distinct company_id
  from tmp_entity_relevance_v3_quarantine
) q;
