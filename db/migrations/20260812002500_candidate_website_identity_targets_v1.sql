-- Bounded target selector for candidate website identity capture.
--
-- Why this exists:
-- candidate_decision_queue_v4 is intentionally rich, but its generic join to
-- capital_market_events compares event.id::text with a JSON text field. On the
-- current production volume this forces a scan/sort of ~285k events and can
-- exceed PostgREST's statement timeout for a small 30-row identity batch.
--
-- This function preserves the current commercial P1/P2 scoring semantics while
-- narrowing the universe to active CVM issuers first and joining the latest
-- capital-market event through the UUID primary key.

begin;

create or replace function public.candidate_website_identity_targets_v1(
  p_limit integer default 30
)
returns table (
  id uuid,
  company_name text,
  legal_name text,
  cnpj text,
  website text,
  normalized_domain text,
  candidate_status text,
  priority_tier text,
  raw_payload jsonb
)
language sql
stable
set search_path = public, pg_temp
as $$
  with active_cvm as (
    select distinct on (e.candidate_id)
      e.candidate_id
    from public.candidate_official_enrichments e
    where e.dataset_code = 'cvm_open_company_registry_candidates'
      and e.enrichment_type = 'cvm_open_company_registry'
      and upper(coalesce(e.data ->> 'registrationSituation', '')) like 'ATIV%'
    order by
      e.candidate_id,
      e.effective_date desc nulls last,
      e.observed_at desc,
      e.updated_at desc,
      e.source_record_key desc
  ),
  ranked_candidates as (
    select
      d.*,
      row_number() over (
        partition by coalesce(
          nullif(d.dedupe_key, ''),
          nullif(regexp_replace(coalesce(d.cnpj, ''), '\D', '', 'g'), ''),
          regexp_replace(lower(coalesce(d.company_name, '')), '[^a-z0-9]+', '', 'g')
        )
        order by
          coalesce((d.raw_payload ->> 'promotion_ready')::boolean, false) desc,
          d.confidence desc nulls last,
          d.captured_at desc nulls last,
          d.created_at desc
      ) as canonical_rank
    from public.discovered_company_candidates d
    join active_cvm cvm on cvm.candidate_id = d.id
    where d.candidate_status = 'captured'
      and coalesce(d.raw_payload ->> 'candidate_role', '') = 'operating_issuer'
      and coalesce((d.raw_payload ->> 'commercial_queue')::boolean, false) = true
      and public.is_valid_cnpj_checksum(d.cnpj)
      and nullif(btrim(coalesce(d.website, '')), '') is null
      and nullif(btrim(coalesce(d.normalized_domain, '')), '') is null
      and not exists (
        select 1
        from public.companies c
        where regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g') =
              regexp_replace(coalesce(d.cnpj, ''), '\D', '', 'g')
          and regexp_replace(coalesce(d.cnpj, ''), '\D', '', 'g') ~ '^\d{14}$'
      )
  ),
  base as (
    select
      d.*,
      coalesce(ev.event_date, ev.reference_date, d.captured_at::date) as latest_event_date,
      case
        when coalesce(d.raw_payload ->> 'eventCount', '') ~ '^\d+$'
          then greatest((d.raw_payload ->> 'eventCount')::integer, 0)
        else 0
      end as event_count,
      coalesce(
        case
          when coalesce(d.raw_payload ->> 'latestVolume', '') ~ '^-?\d+(\.\d+)?$'
            then (d.raw_payload ->> 'latestVolume')::numeric
          else null::numeric
        end,
        ev.volume
      ) as latest_volume
    from ranked_candidates d
    left join public.capital_market_events ev
      on ev.id = case
        when coalesce(d.raw_payload ->> 'latestEventId', '') ~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then (d.raw_payload ->> 'latestEventId')::uuid
        else null::uuid
      end
    where d.canonical_rank = 1
  ),
  scored as (
    select
      b.*,
      least(100, greatest(0,
        35 -- commercial queue
        + 15 -- valid CNPJ
        + case
            when length(btrim(coalesce(b.evidence_summary, ''))) >= 80 then 10
            when length(btrim(coalesce(b.evidence_summary, ''))) >= 40 then 5
            else 0
          end
        + round(least(greatest(coalesce(b.confidence, 0), 0), 1) * 10)::integer
        + case
            when b.latest_event_date >= current_date - interval '365 days' then 20
            when b.latest_event_date >= current_date - interval '730 days' then 12
            when b.latest_event_date is not null then 5
            else 0
          end
        + least(b.event_count * 2, 10)
        + case
            when b.latest_volume >= 100000000 then 10
            when b.latest_volume >= 25000000 then 7
            when b.latest_volume > 0 then 4
            else 0
          end
      )) as priority_score
    from base b
  )
  select
    s.id,
    s.company_name,
    s.legal_name,
    s.cnpj,
    s.website,
    s.normalized_domain,
    s.candidate_status,
    case when s.priority_score >= 75 then 'P1' else 'P2' end as priority_tier,
    s.raw_payload
  from scored s
  where s.priority_score >= 60
  order by s.priority_score desc, s.confidence desc nulls last, s.captured_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

revoke all on function public.candidate_website_identity_targets_v1(integer) from public;
revoke all on function public.candidate_website_identity_targets_v1(integer) from anon;
revoke all on function public.candidate_website_identity_targets_v1(integer) from authenticated;
grant execute on function public.candidate_website_identity_targets_v1(integer) to service_role;

comment on function public.candidate_website_identity_targets_v1(integer) is
  'Returns a bounded P1/P2 active-CVM issuer batch for first-party website identity capture. Uses UUID-indexed event lookup and does not promote candidates or mutate decision eligibility.';

commit;
