-- Candidate Decision Queue calibration v2.
-- Keeps the raw deterministic score and calibrates actionable tiers against the
-- live evidence distribution without promoting or changing decision eligibility.

create or replace function public.candidate_queue_priority_tier(
  p_queue_type text,
  p_priority_score integer
)
returns text
language sql
immutable
security invoker
set search_path = public
as $$
  select case
    when p_queue_type = 'market_map' and coalesce(p_priority_score, 0) >= 81 then 'MAP1'
    when p_queue_type = 'market_map' and coalesce(p_priority_score, 0) >= 77 then 'MAP2'
    when p_queue_type = 'market_map' then 'MAP3'
    when p_queue_type = 'promoted' then 'MONITOR'
    when coalesce(p_priority_score, 0) >= 94 then 'P1'
    when coalesce(p_priority_score, 0) >= 88 then 'P2'
    else 'P3'
  end;
$$;

revoke all on function public.candidate_queue_priority_tier(text, integer)
  from public, anon, authenticated;
grant execute on function public.candidate_queue_priority_tier(text, integer)
  to service_role;

create or replace view public.candidate_decision_queue_v2
with (security_invoker = true)
as
select
  queue.id,
  queue.search_profile_run_id,
  queue.search_profile_id,
  queue.company_name,
  queue.legal_name,
  queue.website,
  queue.normalized_domain,
  queue.cnpj,
  queue.cnpj_valid,
  queue.geography,
  queue.segment,
  queue.subsegment,
  queue.company_type,
  queue.credit_product,
  queue.target_structure,
  queue.source_ref,
  queue.source_family,
  queue.source_url,
  queue.evidence_summary,
  queue.confidence,
  queue.candidate_status,
  queue.company_id,
  queue.matched_company_id,
  queue.dedupe_key,
  queue.duplicate_count,
  queue.canonical_rank,
  queue.candidate_role,
  queue.commercial_queue,
  queue.queue_type,
  queue.instrument_type,
  queue.event_count,
  queue.latest_event_date,
  queue.latest_volume,
  queue.identity_review_status,
  queue.promotion_ready,
  queue.promotion_blockers,
  queue.priority_score,
  public.candidate_queue_priority_tier(queue.queue_type, queue.priority_score) as priority_tier,
  queue.next_action,
  queue.why_now,
  queue.raw_payload,
  queue.captured_at,
  queue.promoted_at,
  queue.created_at,
  queue.updated_at
from public.candidate_decision_queue_v1 queue;

revoke all on public.candidate_decision_queue_v2 from public, anon, authenticated;
grant select on public.candidate_decision_queue_v2 to service_role;

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
    from public.candidate_decision_queue_v2 queue
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
      'calibrationVersion', 2
    ) as payload
    from public.candidate_decision_queue_v2
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
    'generatedAt', now()
  );
$$;

revoke all on function public.list_candidate_decision_queue(text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.list_candidate_decision_queue(text, text, text, integer, integer)
  to service_role;

comment on view public.candidate_decision_queue_v2 is
  'Fila decisória calibrada: P1 >=94, P2 >=88; MAP1 >=81 e MAP2 >=77.';
comment on function public.candidate_queue_priority_tier(text, integer) is
  'Classificação de prioridade versionada para a Candidate Decision Queue v2.';

notify pgrst, 'reload schema';
