-- Authenticated Market Map FIDC contract.
-- The public RPC remains callable only by service_role; the backend is the
-- authenticated user-facing channel. No company signal, qualification,
-- pattern, score, ranking or pipeline mutation is performed here.

create or replace function public.agentetome_fidc_market_map_snapshot(
  p_search text default null,
  p_administrator text default null,
  p_manager text default null,
  p_min_nav numeric default null,
  p_max_nav numeric default null,
  p_min_delinquency_pct numeric default null,
  p_max_subordination_pct numeric default null,
  p_silence_status text default null,
  p_sort text default 'nav_desc',
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
security invoker
stable
set search_path = public
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_search_digits text := nullif(regexp_replace(coalesce(p_search, ''), '\D', '', 'g'), '');
  v_administrator text := nullif(btrim(coalesce(p_administrator, '')), '');
  v_manager text := nullif(btrim(coalesce(p_manager, '')), '');
  v_silence_status text := nullif(upper(btrim(coalesce(p_silence_status, ''))), '');
  v_sort text := coalesce(nullif(btrim(p_sort), ''), 'nav_desc');
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_page_size integer := least(100, greatest(1, coalesce(p_page_size, 25)));
  v_offset integer;
  v_total integer := 0;
  v_summary jsonb := '{}'::jsonb;
  v_universe jsonb := '{}'::jsonb;
  v_facets jsonb := '{}'::jsonb;
  v_rows jsonb := '[]'::jsonb;
begin
  if p_min_nav is not null and p_min_nav < 0 then raise exception 'min_nav_must_be_non_negative'; end if;
  if p_max_nav is not null and p_max_nav < 0 then raise exception 'max_nav_must_be_non_negative'; end if;
  if p_min_nav is not null and p_max_nav is not null and p_min_nav > p_max_nav then
    raise exception 'min_nav_cannot_exceed_max_nav';
  end if;
  if p_min_delinquency_pct is not null and (p_min_delinquency_pct < 0 or p_min_delinquency_pct > 100) then
    raise exception 'min_delinquency_pct_out_of_range';
  end if;
  if p_max_subordination_pct is not null and (p_max_subordination_pct < 0 or p_max_subordination_pct > 100) then
    raise exception 'max_subordination_pct_out_of_range';
  end if;
  if v_silence_status is not null and v_silence_status not in ('EM_DIA', 'DEFASADO', 'SILENCIO') then
    raise exception 'invalid_silence_status';
  end if;
  if v_sort not in ('nav_desc', 'nav_asc', 'delinquency_desc', 'subordination_asc', 'reference_desc', 'fund_asc') then
    raise exception 'invalid_market_map_sort';
  end if;

  v_offset := (v_page - 1) * v_page_size;

  with universe as (
    select * from public.agentetome_fidc_market_map_v1
  )
  select jsonb_build_object(
    'totalFunds', count(*)::integer,
    'fundsWithNav', count(*) filter (where nav is not null)::integer,
    'totalNav', coalesce(sum(nav), 0),
    'medianNav', percentile_cont(0.5) within group (order by nav) filter (where nav is not null),
    'delinquencyAbove5Pct', count(*) filter (where delinquency_to_nav >= 0.05)::integer,
    'delinquencyAbove10Pct', count(*) filter (where delinquency_to_nav >= 0.10)::integer,
    'subordinationBelow10Pct', count(*) filter (where subordination_pct < 0.10)::integer,
    'operationalAttention', count(*) filter (
      where silence_status in ('DEFASADO', 'SILENCIO') or coalesce(current_violations, 0) > 0
    )::integer,
    'unresolvedFunds', count(*) filter (where issuer_company_id is null)::integer,
    'latestReferenceDate', max(reference_date),
    'latestObservedAt', max(observed_at)
  ) into v_universe
  from universe;

  with filtered as (
    select *
    from public.agentetome_fidc_market_map_v1 m
    where (
      v_search is null
      or coalesce(m.fund_name, '') ilike '%' || v_search || '%'
      or (v_search_digits is not null and coalesce(m.fund_cnpj, '') ilike '%' || v_search_digits || '%')
      or coalesce(m.manager_name, '') ilike '%' || v_search || '%'
      or coalesce(m.administrator_name, '') ilike '%' || v_search || '%'
    )
      and (v_administrator is null or m.administrator_name = v_administrator)
      and (v_manager is null or m.manager_name = v_manager)
      and (p_min_nav is null or m.nav >= p_min_nav)
      and (p_max_nav is null or m.nav <= p_max_nav)
      and (p_min_delinquency_pct is null or m.delinquency_to_nav >= p_min_delinquency_pct / 100.0)
      and (p_max_subordination_pct is null or m.subordination_pct <= p_max_subordination_pct / 100.0)
      and (v_silence_status is null or m.silence_status = v_silence_status)
  )
  select
    count(*)::integer,
    jsonb_build_object(
      'totalFunds', count(*)::integer,
      'fundsWithNav', count(*) filter (where nav is not null)::integer,
      'totalNav', coalesce(sum(nav), 0),
      'medianNav', percentile_cont(0.5) within group (order by nav) filter (where nav is not null),
      'delinquencyAbove5Pct', count(*) filter (where delinquency_to_nav >= 0.05)::integer,
      'delinquencyAbove10Pct', count(*) filter (where delinquency_to_nav >= 0.10)::integer,
      'subordinationBelow10Pct', count(*) filter (where subordination_pct < 0.10)::integer,
      'operationalAttention', count(*) filter (
        where silence_status in ('DEFASADO', 'SILENCIO') or coalesce(current_violations, 0) > 0
      )::integer,
      'unresolvedFunds', count(*) filter (where issuer_company_id is null)::integer,
      'latestReferenceDate', max(reference_date),
      'latestObservedAt', max(observed_at)
    )
  into v_total, v_summary
  from filtered;

  select jsonb_build_object(
    'administrators', coalesce((
      select jsonb_agg(value order by value)
      from (
        select distinct administrator_name as value
        from public.agentetome_fidc_market_map_v1
        where administrator_name is not null
      ) values_list
    ), '[]'::jsonb),
    'managers', coalesce((
      select jsonb_agg(value order by value)
      from (
        select distinct manager_name as value
        from public.agentetome_fidc_market_map_v1
        where manager_name is not null
      ) values_list
    ), '[]'::jsonb),
    'silenceStatuses', coalesce((
      select jsonb_agg(value order by value)
      from (
        select distinct silence_status as value
        from public.agentetome_fidc_market_map_v1
        where silence_status is not null
      ) values_list
    ), '[]'::jsonb)
  ) into v_facets;

  with filtered as (
    select *
    from public.agentetome_fidc_market_map_v1 m
    where (
      v_search is null
      or coalesce(m.fund_name, '') ilike '%' || v_search || '%'
      or (v_search_digits is not null and coalesce(m.fund_cnpj, '') ilike '%' || v_search_digits || '%')
      or coalesce(m.manager_name, '') ilike '%' || v_search || '%'
      or coalesce(m.administrator_name, '') ilike '%' || v_search || '%'
    )
      and (v_administrator is null or m.administrator_name = v_administrator)
      and (v_manager is null or m.manager_name = v_manager)
      and (p_min_nav is null or m.nav >= p_min_nav)
      and (p_max_nav is null or m.nav <= p_max_nav)
      and (p_min_delinquency_pct is null or m.delinquency_to_nav >= p_min_delinquency_pct / 100.0)
      and (p_max_subordination_pct is null or m.subordination_pct <= p_max_subordination_pct / 100.0)
      and (v_silence_status is null or m.silence_status = v_silence_status)
  ), ordered as (
    select *
    from filtered
    order by
      case when v_sort = 'nav_desc' then nav end desc nulls last,
      case when v_sort = 'nav_asc' then nav end asc nulls last,
      case when v_sort = 'delinquency_desc' then delinquency_to_nav end desc nulls last,
      case when v_sort = 'subordination_asc' then subordination_pct end asc nulls last,
      case when v_sort = 'reference_desc' then reference_date end desc nulls last,
      case when v_sort = 'fund_asc' then fund_name end asc nulls last,
      fund_name asc nulls last,
      fund_cnpj asc
    limit v_page_size offset v_offset
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'eventId', event_id,
    'fundCnpj', fund_cnpj,
    'fundName', fund_name,
    'referenceDate', reference_date,
    'deliveredAt', delivered_at,
    'deliveryStatus', delivery_status,
    'nav', nav,
    'portfolio', portfolio,
    'delinquencyTotal', delinquency_total,
    'delinquencyToNav', delinquency_to_nav,
    'pdd', pdd,
    'subordinationPct', subordination_pct,
    'investors', investors,
    'administratorCnpj', administrator_cnpj,
    'administratorName', administrator_name,
    'managerName', manager_name,
    'custodianName', custodian_name,
    'silenceStatus', silence_status,
    'monthsWithoutReport', months_without_report,
    'delays12m', delays_12m,
    'refilings12m', refilings_12m,
    'currentViolations', current_violations,
    'companyResolutionStatus', company_resolution_status,
    'issuerCompanyId', issuer_company_id,
    'observedAt', observed_at,
    'highDelinquency', coalesce(delinquency_to_nav, 0) >= 0.05,
    'lowSubordination', subordination_pct is not null and subordination_pct < 0.10,
    'operationalAttention', silence_status in ('DEFASADO', 'SILENCIO') or coalesce(current_violations, 0) > 0,
    'ratioOutlier', coalesce(delinquency_to_nav, 0) > 1 or coalesce(subordination_pct, 0) > 1
  )), '[]'::jsonb)
  into v_rows
  from ordered;

  return jsonb_build_object(
    'source', jsonb_build_object(
      'provider', 'Agentetome',
      'sourceCode', 'src_agentetome_api',
      'underlyingOfficialSources', jsonb_build_array('CVM', 'FNET'),
      'confidenceCap', 0.78,
      'scoreImpact', false
    ),
    'filters', jsonb_build_object(
      'search', v_search,
      'administrator', v_administrator,
      'manager', v_manager,
      'minNav', p_min_nav,
      'maxNav', p_max_nav,
      'minDelinquencyPct', p_min_delinquency_pct,
      'maxSubordinationPct', p_max_subordination_pct,
      'silenceStatus', v_silence_status,
      'sort', v_sort
    ),
    'universe', v_universe,
    'summary', v_summary,
    'facets', v_facets,
    'pagination', jsonb_build_object(
      'page', v_page,
      'pageSize', v_page_size,
      'total', v_total,
      'totalPages', case when v_total = 0 then 0 else ceil(v_total::numeric / v_page_size)::integer end,
      'hasPrevious', v_page > 1,
      'hasNext', v_offset + v_page_size < v_total
    ),
    'rows', v_rows,
    'generatedAt', now()
  );
end;
$$;

comment on function public.agentetome_fidc_market_map_snapshot(
  text, text, text, numeric, numeric, numeric, numeric, text, text, integer, integer
) is 'Returns a filtered, paginated and score-isolated FIDC market map. Service-role only; authenticated access must pass through the backend.';

revoke all on function public.agentetome_fidc_market_map_snapshot(
  text, text, text, numeric, numeric, numeric, numeric, text, text, integer, integer
) from public, anon, authenticated;

grant execute on function public.agentetome_fidc_market_map_snapshot(
  text, text, text, numeric, numeric, numeric, numeric, text, text, integer, integer
) to service_role;

notify pgrst, 'reload schema';
