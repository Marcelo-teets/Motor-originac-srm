-- Candidate Decision Queue filter hardening.
-- Adds the composite reviewable queue and prevents text searches from becoming
-- an empty CNPJ wildcard.

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
      'duplicateGroups', count(*) filter (where duplicate_count > 1 and canonical_rank = 1)
    ) as payload
    from public.candidate_decision_queue_v1
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
    'generatedAt', now()
  );
$$;

revoke all on function public.list_candidate_decision_queue(text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.list_candidate_decision_queue(text, text, text, integer, integer)
  to service_role;

comment on function public.list_candidate_decision_queue(text, text, text, integer, integer) is
  'Retorna Candidate Decision Queue paginada; reviewable combina comercial e identidade sem incluir veículos.';

notify pgrst, 'reload schema';
