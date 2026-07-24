-- Candidate Decision Queue coverage routing v3.
-- Distinguishes strong triggers from coverage ownership using official CVM
-- company-registry evidence. It does not infer size, revenue or credit fit.

create or replace view public.candidate_decision_queue_v3
with (security_invoker = true)
as
select
  queue.*,
  enrichment.id as cvm_registry_enrichment_id,
  enrichment.effective_date as cvm_registry_effective_date,
  enrichment.data->>'cvmCode' as cvm_code,
  enrichment.data->>'registrationSituation' as cvm_registration_situation,
  enrichment.data->>'issuerSituation' as cvm_issuer_situation,
  enrichment.data->>'registrationCategory' as cvm_registration_category,
  enrichment.data->>'activitySector' as cvm_activity_sector,
  (enrichment.id is not null) as is_cvm_open_company,
  case
    when queue.queue_type = 'market_map' then 'market_map'
    when queue.queue_type = 'promoted' then 'promoted'
    when queue.queue_type = 'identity' then 'identity'
    when enrichment.id is not null then 'institutional_dcm'
    else 'dcm_unclassified'
  end as coverage_lane,
  case
    when queue.queue_type = 'market_map'
      then 'Veículo ou intermediário: mapear cedente, devedor, originador e lastro.'
    when queue.queue_type = 'promoted'
      then 'Entidade já vinculada ao Company Master; cobertura definida no fluxo da empresa.'
    when queue.queue_type = 'identity'
      then 'Identidade jurídica insuficiente para roteamento de cobertura.'
    when enrichment.id is not null
      then concat_ws(
        ' · ',
        'CNPJ consta no cadastro oficial de companhias abertas da CVM',
        nullif(enrichment.data->>'registrationSituation', ''),
        nullif(enrichment.data->>'registrationCategory', ''),
        nullif(enrichment.data->>'activitySector', '')
      )
    else 'Emissor com trigger real, mas ainda sem evidência oficial suficiente para classificar ICP ou porte.'
  end as coverage_rationale,
  case
    when queue.queue_type = 'market_map'
      then queue.next_action
    when queue.queue_type = 'promoted'
      then queue.next_action
    when queue.queue_type = 'identity'
      then 'Concluir identidade jurídica antes de definir cobertura.'
    when enrichment.id is not null
      then 'Encaminhar para cobertura Institutional DCM e validar oportunidade específica da emissão.'
    else 'Executar enriquecimento RFB/CNAE/porte antes de classificar core ICP ou middle-market DCM.'
  end as coverage_next_action,
  3 as coverage_routing_version
from public.candidate_decision_queue_v2 queue
left join lateral (
  select enrichment_row.*
  from public.candidate_official_enrichments enrichment_row
  where enrichment_row.candidate_id = queue.id
    and enrichment_row.dataset_code = 'cvm_open_company_registry_candidates'
    and enrichment_row.enrichment_type = 'cvm_open_company_registry'
  order by enrichment_row.observed_at desc, enrichment_row.updated_at desc
  limit 1
) enrichment on true;

revoke all on public.candidate_decision_queue_v3 from public, anon, authenticated;
grant select on public.candidate_decision_queue_v3 to service_role;

create or replace function public.list_candidate_decision_queue(
  p_queue text default 'commercial',
  p_priority text default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language sql
security invoker
stable
set search_path = public
as $$
  with filtered as (
    select queue.*
    from public.candidate_decision_queue_v3 queue
    where queue.canonical_rank = 1
      and (
        coalesce(nullif(p_queue, ''), 'commercial') = 'all'
        or (p_queue = 'reviewable' and queue.queue_type in ('commercial', 'identity'))
        or queue.queue_type = p_queue
      )
      and (nullif(p_priority, '') is null or queue.priority_tier = p_priority)
      and (
        nullif(btrim(coalesce(p_search, '')), '') is null
        or queue.company_name ilike '%' || btrim(p_search) || '%'
        or coalesce(queue.legal_name, '') ilike '%' || btrim(p_search) || '%'
        or (
          nullif(regexp_replace(p_search, '\D', '', 'g'), '') is not null
          and regexp_replace(coalesce(queue.cnpj, ''), '\D', '', 'g')
            like '%' || regexp_replace(p_search, '\D', '', 'g') || '%'
        )
      )
  ), page as (
    select *
    from filtered
    order by priority_score desc, latest_event_date desc nulls last, confidence desc nulls last, company_name
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    offset greatest(coalesce(p_offset, 0), 0)
  ), stats as (
    select jsonb_build_object(
      'totalCandidates', count(*),
      'commercialCandidates', count(*) filter (where queue_type = 'commercial'),
      'marketMapCandidates', count(*) filter (where queue_type = 'market_map'),
      'identityCandidates', count(*) filter (where queue_type = 'identity'),
      'promotedCandidates', count(*) filter (where queue_type = 'promoted'),
      'p1Commercial', count(*) filter (where queue_type = 'commercial' and priority_tier = 'P1'),
      'p2Commercial', count(*) filter (where queue_type = 'commercial' and priority_tier = 'P2'),
      'validCnpj', count(*) filter (where cnpj_valid),
      'promotionReady', count(*) filter (where promotion_ready),
      'duplicateGroups', count(*) filter (where duplicate_count > 1 and canonical_rank = 1),
      'institutionalDcm', count(*) filter (where coverage_lane = 'institutional_dcm'),
      'dcmUnclassified', count(*) filter (where coverage_lane = 'dcm_unclassified'),
      'calibrationVersion', 2,
      'coverageRoutingVersion', 3
    ) as payload
    from public.candidate_decision_queue_v3
    where canonical_rank = 1
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(
        to_jsonb(page_row)
        order by page_row.priority_score desc,
          page_row.latest_event_date desc nulls last,
          page_row.company_name
      )
      from page page_row
    ), '[]'::jsonb),
    'pagination', jsonb_build_object(
      'limit', least(greatest(coalesce(p_limit, 50), 1), 200),
      'offset', greatest(coalesce(p_offset, 0), 0),
      'total', (select count(*) from filtered)
    ),
    'stats', (select payload from stats),
    'calibrationVersion', 2,
    'coverageRoutingVersion', 3,
    'generatedAt', now()
  );
$$;

revoke all on function public.list_candidate_decision_queue(text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.list_candidate_decision_queue(text, text, text, integer, integer)
  to service_role;

comment on view public.candidate_decision_queue_v3 is
  'Fila com trigger score, tier e roteamento de cobertura baseado em evidência cadastral oficial CVM.';

notify pgrst, 'reload schema';
