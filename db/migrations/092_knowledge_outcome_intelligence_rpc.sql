create or replace function public.knowledge_outcome_intelligence(
  p_company_id uuid default null,
  p_days integer default 365
)
returns jsonb
language plpgsql
security invoker
stable
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  result jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_days < 30 or p_days > 3650 then
    raise exception 'p_days must be between 30 and 3650';
  end if;

  with filtered as (
    select *
    from public.knowledge_execution_outcomes_v1 o
    where (p_company_id is null or o.company_id = p_company_id)
      and o.occurred_at >= now() - make_interval(days => p_days)
  ), dimension_rows as (
    select f.*, 'action_type'::text as dimension_type, f.activity_type::text as dimension_value from filtered f
    union all
    select f.*, 'node_type'::text, f.node_type::text from filtered f
    union all
    select f.*, 'structure'::text, f.suggested_structure::text from filtered f where nullif(f.suggested_structure, '') is not null
    union all
    select f.*, 'signal_type'::text, signal_type from filtered f cross join lateral unnest(f.signal_types) signal_type
    union all
    select f.*, 'pattern'::text, pattern_code from filtered f cross join lateral unnest(f.pattern_codes) pattern_code
    union all
    select f.*, 'factor'::text, factor_code from filtered f cross join lateral unnest(f.factor_codes) factor_code
  ), dimension_agg as (
    select
      dimension_type,
      dimension_value,
      count(*)::integer as executions,
      count(distinct company_id)::integer as companies_observed,
      count(*) filter (where outcome_status is not null)::integer as completed_outcomes,
      count(*) filter (where outcome_status = 'won')::integer as won,
      count(*) filter (where outcome_status = 'lost')::integer as lost,
      count(*) filter (where outcome_status = 'progress')::integer as progress,
      count(*) filter (where outcome_status = 'blocked')::integer as blocked,
      count(*) filter (where outcome_status = 'no_change')::integer as no_change,
      count(*) filter (where outcome_status is null)::integer as open,
      count(*) filter (where outcome_status in ('won', 'lost'))::integer as terminal_decisions,
      round(count(*) filter (where outcome_status = 'won')::numeric / nullif(count(*) filter (where outcome_status in ('won', 'lost')), 0), 4) as observed_win_rate,
      round(count(*) filter (where stage_advanced is true)::numeric / nullif(count(*) filter (where stage_advanced is not null), 0), 4) as observed_stage_advance_rate,
      round(avg(cycle_days) filter (where cycle_days is not null), 2) as average_cycle_days,
      count(*) filter (where context_mode = 'captured_at_action')::integer as captured_context_count,
      count(*) filter (where context_mode <> 'captured_at_action')::integer as reconstructed_context_count,
      case
        when count(*) filter (where outcome_status in ('won', 'lost')) >= 20 then 'stronger'
        when count(*) filter (where outcome_status in ('won', 'lost')) >= 5 then 'directional'
        else 'insufficient'
      end as sample_quality,
      max(coalesce(completed_at, occurred_at)) as latest_observation_at
    from dimension_rows
    where nullif(dimension_value, '') is not null
    group by dimension_type, dimension_value
  ), factor_filtered as (
    select *
    from public.factor_outcome_observations_v2 f
    where p_company_id is null or f.company_id = p_company_id
  ), factor_agg as (
    select
      factor_code,
      factor_name,
      dimension,
      count(distinct company_id)::integer as companies_observed,
      count(distinct company_id) filter (where outcome_label = 'positive')::integer as positive_outcomes,
      count(distinct company_id) filter (where outcome_label = 'negative')::integer as negative_outcomes,
      count(distinct company_id) filter (where outcome_label = 'active_pipeline')::integer as active_pipeline,
      count(distinct company_id) filter (where outcome_label = 'unworked')::integer as unworked,
      round(avg(score), 2) as average_factor_score,
      round(avg(net_contribution), 2) as average_net_contribution,
      round(avg(confidence_score), 4) as average_confidence,
      round(count(distinct company_id) filter (where outcome_label = 'positive')::numeric / nullif(count(distinct company_id) filter (where outcome_label in ('positive', 'negative')), 0), 4) as observed_positive_rate,
      case
        when count(distinct company_id) filter (where outcome_label in ('positive', 'negative')) >= 20 then 'stronger'
        when count(distinct company_id) filter (where outcome_label in ('positive', 'negative')) >= 5 then 'directional'
        else 'insufficient'
      end as sample_quality,
      max(latest_observed_at) as latest_evidence_at
    from factor_filtered
    group by factor_code, factor_name, dimension
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'scope', case when p_company_id is null then 'global' else 'company' end,
    'companyId', p_company_id,
    'windowDays', p_days,
    'summary', (
      select jsonb_build_object(
        'executions', count(*)::integer,
        'companiesObserved', count(distinct company_id)::integer,
        'completedOutcomes', count(*) filter (where outcome_status is not null)::integer,
        'openExecutions', count(*) filter (where outcome_status is null)::integer,
        'won', count(*) filter (where outcome_status = 'won')::integer,
        'lost', count(*) filter (where outcome_status = 'lost')::integer,
        'progress', count(*) filter (where outcome_status = 'progress')::integer,
        'blocked', count(*) filter (where outcome_status = 'blocked')::integer,
        'noChange', count(*) filter (where outcome_status = 'no_change')::integer,
        'terminalDecisions', count(*) filter (where outcome_status in ('won', 'lost'))::integer,
        'observedWinRate', round(count(*) filter (where outcome_status = 'won')::numeric / nullif(count(*) filter (where outcome_status in ('won', 'lost')), 0), 4),
        'observedStageAdvanceRate', round(count(*) filter (where stage_advanced is true)::numeric / nullif(count(*) filter (where stage_advanced is not null), 0), 4),
        'averageCycleDays', round(avg(cycle_days) filter (where cycle_days is not null), 2),
        'capturedContextCount', count(*) filter (where context_mode = 'captured_at_action')::integer,
        'reconstructedContextCount', count(*) filter (where context_mode <> 'captured_at_action')::integer
      )
      from filtered
    ),
    'dimensions', jsonb_build_object(
      'actionTypes', coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.executions desc, row_data.dimension_value) from (select * from dimension_agg where dimension_type = 'action_type' order by executions desc, dimension_value limit 12) row_data), '[]'::jsonb),
      'nodeTypes', coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.executions desc, row_data.dimension_value) from (select * from dimension_agg where dimension_type = 'node_type' order by executions desc, dimension_value limit 12) row_data), '[]'::jsonb),
      'structures', coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.executions desc, row_data.dimension_value) from (select * from dimension_agg where dimension_type = 'structure' order by executions desc, dimension_value limit 12) row_data), '[]'::jsonb),
      'signalTypes', coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.executions desc, row_data.dimension_value) from (select * from dimension_agg where dimension_type = 'signal_type' order by executions desc, dimension_value limit 12) row_data), '[]'::jsonb),
      'patterns', coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.executions desc, row_data.dimension_value) from (select * from dimension_agg where dimension_type = 'pattern' order by executions desc, dimension_value limit 12) row_data), '[]'::jsonb),
      'factors', coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.executions desc, row_data.dimension_value) from (select * from dimension_agg where dimension_type = 'factor' order by executions desc, dimension_value limit 16) row_data), '[]'::jsonb)
    ),
    'factorPipelineMap', coalesce((
      select jsonb_agg(to_jsonb(factor_row) order by factor_row.companies_observed desc, factor_row.average_net_contribution desc nulls last)
      from (
        select * from factor_agg
        order by companies_observed desc, average_net_contribution desc nulls last
        limit 16
      ) factor_row
    ), '[]'::jsonb),
    'recentExecutions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'activityId', recent.activity_id,
        'companyId', recent.company_id,
        'companyName', recent.company_name,
        'nodeId', recent.node_id,
        'nodeTitle', recent.node_title,
        'activityType', recent.activity_type,
        'title', recent.activity_title,
        'outcomeStatus', recent.outcome_status,
        'outcome', recent.outcome,
        'suggestedStructure', recent.suggested_structure,
        'occurredAt', recent.occurred_at,
        'completedAt', recent.completed_at,
        'cycleDays', recent.cycle_days,
        'contextMode', recent.context_mode
      ) order by recent.occurred_at desc)
      from (
        select * from filtered
        order by occurred_at desc
        limit 12
      ) recent
    ), '[]'::jsonb),
    'caveat', 'Associações observacionais. Taxas não provam causalidade, não alteram scores automaticamente e devem ser interpretadas com tamanho de amostra, contexto capturado e estágio do pipeline.'
  ) into result;

  return result;
end;
$$;

comment on function public.knowledge_outcome_intelligence(uuid, integer)
is 'Returns descriptive outcome intelligence for knowledge-linked executions and conservative factor-to-pipeline associations. Never updates model weights.';

revoke all on function public.knowledge_outcome_intelligence(uuid, integer) from public, anon;
grant execute on function public.knowledge_outcome_intelligence(uuid, integer) to authenticated, service_role;
