-- Candidate Decision Queue
-- Separates direct commercial leads from capital-market vehicles and identity work.
-- No candidate is approved, promoted or decision-eligible automatically.

create or replace function public.apply_candidate_commercial_semantics()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_instrument text := upper(coalesce(new.raw_payload->>'latestInstrumentType', ''));
  v_name text := upper(coalesce(nullif(btrim(new.legal_name), ''), nullif(btrim(new.company_name), ''), ''));
  v_role text;
  v_commercial_queue boolean;
  v_reason text;
begin
  if coalesce(new.source_ref, '') like 'capital_market_event:%' then
    if v_instrument in ('FIDC', 'CRI', 'CRA', 'FII') then
      v_role := 'market_vehicle';
      v_commercial_queue := false;
      v_reason := 'issuer_record_represents_market_vehicle';
      new.company_type := 'Veículo / emissor da estrutura';
      new.credit_product := 'Não é lead direto — mapear cedente, devedor, originador e lastro';
    elsif v_name ~ '(FUNDO DE INVESTIMENTO|(^|[^A-Z])FIDC([^A-Z]|$)|SECURITIZADORA|(^|[^A-Z])BANCO([^A-Z]|$)|DTVM|GESTORA|ADMINISTRADORA)' then
      v_role := 'financial_intermediary';
      v_commercial_queue := false;
      v_reason := 'financial_intermediary_not_direct_originator';
      new.company_type := 'Intermediário financeiro';
      new.credit_product := 'Não é lead direto — identificar a parte econômica da emissão';
    elsif v_instrument = 'DEBENTURE' then
      v_role := 'operating_issuer';
      v_commercial_queue := true;
      v_reason := 'corporate_debenture_issuer';
      new.company_type := 'Emissor corporativo';
      new.credit_product := coalesce(nullif(new.credit_product, ''), 'Dívida corporativa — validar funding gap e uso de recursos');
    else
      v_role := 'needs_classification';
      v_commercial_queue := false;
      v_reason := 'instrument_role_not_classified';
    end if;

    new.raw_payload := coalesce(new.raw_payload, '{}'::jsonb) || jsonb_build_object(
      'candidate_role', v_role,
      'commercial_queue', v_commercial_queue,
      'commercial_semantics_reason', v_reason,
      'commercial_semantics_version', 1
    );
  end if;

  return new;
end;
$$;

revoke all on function public.apply_candidate_commercial_semantics() from public, anon, authenticated;
grant execute on function public.apply_candidate_commercial_semantics() to service_role;

drop trigger if exists candidate_commercial_semantics_guard on public.discovered_company_candidates;
create trigger candidate_commercial_semantics_guard
before insert or update of source_ref, company_name, legal_name, company_type, credit_product, raw_payload
on public.discovered_company_candidates
for each row execute function public.apply_candidate_commercial_semantics();

-- Backfill current capital-market candidates through both the commercial semantics
-- trigger and the existing identity quality trigger.
update public.discovered_company_candidates
set raw_payload = coalesce(raw_payload, '{}'::jsonb),
    updated_at = now()
where coalesce(source_ref, '') like 'capital_market_event:%';

create or replace view public.candidate_decision_queue_v1
with (security_invoker = true)
as
with candidate_base as (
  select
    candidate.id,
    candidate.search_profile_run_id,
    candidate.search_profile_id,
    candidate.company_name,
    candidate.legal_name,
    candidate.website,
    candidate.normalized_domain,
    candidate.cnpj,
    candidate.geography,
    candidate.segment,
    candidate.subsegment,
    candidate.company_type,
    candidate.credit_product,
    candidate.target_structure,
    candidate.source_ref,
    candidate.source_url,
    candidate.evidence_summary,
    candidate.confidence,
    candidate.candidate_status,
    candidate.company_id,
    coalesce(candidate.company_id, company.id) as matched_company_id,
    candidate.dedupe_key,
    candidate.raw_payload,
    candidate.captured_at,
    candidate.promoted_at,
    candidate.created_at,
    candidate.updated_at,
    case
      when btrim(coalesce(candidate.source_ref, '')) like 'capital_market_event:%' then 'capital-market-event'
      when btrim(coalesce(candidate.source_ref, '')) like 'vc-portfolio:%' then 'vc-portfolio'
      when btrim(coalesce(candidate.source_ref, '')) like 'company-registry%' then 'company-registry'
      when btrim(coalesce(candidate.source_ref, '')) like 'vercel-openrss%' then 'vercel-openrss'
      when btrim(coalesce(candidate.source_ref, '')) like 'public-web%' then 'public-web'
      when btrim(coalesce(candidate.source_ref, '')) like 'public-pdf%' then 'public-pdf'
      else coalesce(nullif(btrim(candidate.source_ref), ''), 'unknown')
    end as source_family,
    upper(coalesce(candidate.raw_payload->>'latestInstrumentType', '')) as instrument_type,
    case
      when coalesce(candidate.raw_payload->>'eventCount', '') ~ '^\d+$'
        then greatest((candidate.raw_payload->>'eventCount')::integer, 0)
      else 0
    end as event_count,
    coalesce(event.event_date, event.reference_date, candidate.captured_at::date) as latest_event_date,
    coalesce(
      case
        when coalesce(candidate.raw_payload->>'latestVolume', '') ~ '^-?\d+(\.\d+)?$'
          then (candidate.raw_payload->>'latestVolume')::numeric
        else null
      end,
      event.volume
    ) as latest_volume,
    coalesce(
      nullif(candidate.raw_payload->>'candidate_role', ''),
      case
        when candidate.raw_payload->>'origin' = 'vc_portfolio_page' then 'portfolio_company'
        else 'needs_classification'
      end
    ) as candidate_role,
    coalesce((candidate.raw_payload->>'commercial_queue')::boolean, false) as commercial_queue,
    coalesce((candidate.raw_payload->>'promotion_ready')::boolean, false) as promotion_ready,
    coalesce(candidate.raw_payload->'promotion_blockers', '[]'::jsonb) as promotion_blockers,
    coalesce(candidate.raw_payload->>'identity_review_status', 'pending') as identity_review_status,
    public.is_valid_cnpj_checksum(candidate.cnpj) as cnpj_valid,
    count(*) over (
      partition by coalesce(
        nullif(candidate.dedupe_key, ''),
        nullif(regexp_replace(coalesce(candidate.cnpj, ''), '\D', '', 'g'), ''),
        regexp_replace(lower(coalesce(candidate.company_name, '')), '[^a-z0-9]+', '', 'g')
      )
    )::integer as duplicate_count,
    row_number() over (
      partition by coalesce(
        nullif(candidate.dedupe_key, ''),
        nullif(regexp_replace(coalesce(candidate.cnpj, ''), '\D', '', 'g'), ''),
        regexp_replace(lower(coalesce(candidate.company_name, '')), '[^a-z0-9]+', '', 'g')
      )
      order by
        (candidate.company_id is not null) desc,
        coalesce((candidate.raw_payload->>'promotion_ready')::boolean, false) desc,
        candidate.confidence desc nulls last,
        candidate.captured_at desc nulls last,
        candidate.created_at desc
    )::integer as canonical_rank
  from public.discovered_company_candidates candidate
  left join public.capital_market_events event
    on event.id::text = candidate.raw_payload->>'latestEventId'
  left join public.companies company
    on regexp_replace(coalesce(company.cnpj, ''), '\D', '', 'g') = regexp_replace(coalesce(candidate.cnpj, ''), '\D', '', 'g')
   and regexp_replace(coalesce(candidate.cnpj, ''), '\D', '', 'g') ~ '^\d{14}$'
), classified as (
  select
    candidate_base.*,
    case
      when candidate_status = 'promoted' or matched_company_id is not null then 'promoted'
      when candidate_role = 'operating_issuer' and commercial_queue then 'commercial'
      when candidate_role in ('market_vehicle', 'financial_intermediary') then 'market_map'
      else 'identity'
    end as queue_type
  from candidate_base
), scored as (
  select
    classified.*,
    least(100, greatest(0,
      case queue_type
        when 'commercial' then 35
        when 'market_map' then 20
        when 'identity' then 15
        else 10
      end
      + case when cnpj_valid then 15 else 0 end
      + case when nullif(btrim(coalesce(website, '')), '') is not null then 7 else 0 end
      + case when nullif(btrim(coalesce(normalized_domain, '')), '') is not null then 7 else 0 end
      + case when length(btrim(coalesce(evidence_summary, ''))) >= 80 then 10 when length(btrim(coalesce(evidence_summary, ''))) >= 40 then 5 else 0 end
      + round(least(greatest(coalesce(confidence, 0), 0), 1) * 10)::integer
      + case
          when latest_event_date >= current_date - interval '365 days' then 20
          when latest_event_date >= current_date - interval '730 days' then 12
          when latest_event_date is not null then 5
          else 0
        end
      + least(event_count * 2, 10)
      + case
          when latest_volume >= 100000000 then 10
          when latest_volume >= 25000000 then 7
          when latest_volume > 0 then 4
          else 0
        end
      - case when canonical_rank > 1 then 25 else 0 end
      - case when candidate_status in ('discarded', 'rejected') then 40 else 0 end
    ))::integer as priority_score
  from classified
)
select
  scored.id,
  scored.search_profile_run_id,
  scored.search_profile_id,
  scored.company_name,
  scored.legal_name,
  scored.website,
  scored.normalized_domain,
  scored.cnpj,
  scored.cnpj_valid,
  scored.geography,
  scored.segment,
  scored.subsegment,
  scored.company_type,
  scored.credit_product,
  scored.target_structure,
  scored.source_ref,
  scored.source_family,
  scored.source_url,
  scored.evidence_summary,
  scored.confidence,
  scored.candidate_status,
  scored.company_id,
  scored.matched_company_id,
  scored.dedupe_key,
  scored.duplicate_count,
  scored.canonical_rank,
  scored.candidate_role,
  scored.commercial_queue,
  scored.queue_type,
  scored.instrument_type,
  scored.event_count,
  scored.latest_event_date,
  scored.latest_volume,
  scored.identity_review_status,
  scored.promotion_ready,
  scored.promotion_blockers,
  scored.priority_score,
  case
    when scored.queue_type = 'market_map' and scored.priority_score >= 70 then 'MAP1'
    when scored.queue_type = 'market_map' and scored.priority_score >= 55 then 'MAP2'
    when scored.queue_type = 'market_map' then 'MAP3'
    when scored.queue_type = 'promoted' then 'MONITOR'
    when scored.priority_score >= 75 then 'P1'
    when scored.priority_score >= 60 then 'P2'
    else 'P3'
  end as priority_tier,
  case
    when scored.queue_type = 'promoted' then 'Revisar monitoramento, qualification e próxima ação comercial.'
    when scored.candidate_role = 'market_vehicle' then 'Mapear cedente, devedor, originador e lastro nos documentos da operação.'
    when scored.candidate_role = 'financial_intermediary' then 'Manter no mapa de mercado e identificar o cliente econômico da emissão.'
    when not scored.cnpj_valid then 'Enriquecer CNPJ, razão social e website oficial.'
    when scored.promotion_ready then 'Finalizar promoção humana para o Company Master.'
    when nullif(btrim(coalesce(scored.website, '')), '') is null or nullif(btrim(coalesce(scored.normalized_domain, '')), '') is null
      then 'Reconciliar website e domínio; depois abrir revisão de identidade.'
    when scored.candidate_role = 'operating_issuer' then 'Abrir revisão de identidade e validar funding gap, estrutura e timing.'
    else 'Confirmar entidade jurídica e aderência ao ICP antes de qualquer decisão.'
  end as next_action,
  case
    when scored.source_family = 'capital-market-event' then concat_ws(
      ' · ',
      nullif(scored.instrument_type, ''),
      concat(scored.event_count, ' evento(s)'),
      case when scored.latest_event_date is not null then concat('último em ', to_char(scored.latest_event_date, 'DD/MM/YYYY')) end,
      case when scored.latest_volume is not null then concat('R$ ', to_char(scored.latest_volume, 'FM999G999G999G990D00')) end
    )
    else coalesce(nullif(scored.evidence_summary, ''), 'Sem trigger individual consolidado.')
  end as why_now,
  scored.raw_payload,
  scored.captured_at,
  scored.promoted_at,
  scored.created_at,
  scored.updated_at
from scored;

revoke all on public.candidate_decision_queue_v1 from public, anon, authenticated;
grant select on public.candidate_decision_queue_v1 to service_role;

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
    from public.candidate_decision_queue_v1 queue
    where queue.canonical_rank = 1
      and (coalesce(nullif(p_queue, ''), 'commercial') = 'all' or queue.queue_type = p_queue)
      and (nullif(p_priority, '') is null or queue.priority_tier = p_priority)
      and (
        nullif(btrim(coalesce(p_search, '')), '') is null
        or queue.company_name ilike '%' || btrim(p_search) || '%'
        or coalesce(queue.legal_name, '') ilike '%' || btrim(p_search) || '%'
        or regexp_replace(coalesce(queue.cnpj, ''), '\D', '', 'g') like '%' || regexp_replace(p_search, '\D', '', 'g') || '%'
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
      'duplicateGroups', count(*) filter (where duplicate_count > 1 and canonical_rank = 1)
    ) as payload
    from public.candidate_decision_queue_v1
    where canonical_rank = 1
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(page_row) order by page_row.priority_score desc, page_row.latest_event_date desc nulls last, page_row.company_name)
      from page page_row
    ), '[]'::jsonb),
    'pagination', jsonb_build_object(
      'limit', least(greatest(coalesce(p_limit, 50), 1), 200),
      'offset', greatest(coalesce(p_offset, 0), 0),
      'total', (select count(*) from filtered)
    ),
    'stats', (select payload from stats),
    'generatedAt', now()
  );
$$;

revoke all on function public.list_candidate_decision_queue(text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.list_candidate_decision_queue(text, text, text, integer, integer) to service_role;

comment on view public.candidate_decision_queue_v1 is
  'Fila determinística que separa emissores operacionais, identidade, veículos de mercado e empresas já promovidas.';
comment on function public.list_candidate_decision_queue(text, text, text, integer, integer) is
  'Retorna Candidate Decision Queue paginada, priorizada e segura para o backend.';

notify pgrst, 'reload schema';
