create or replace view public.knowledge_execution_outcomes_v1
with (security_invoker = true)
as
with base as (
  select
    a.id as activity_id,
    a.company_id,
    coalesce(c.trade_name, c.legal_name) as company_name,
    a.pipeline_id,
    kr.node_id,
    n.title as node_title,
    n.node_type,
    coalesce(n.tags, array[]::text[]) as node_tags,
    a.activity_type,
    a.title as activity_title,
    a.description,
    a.owner_name,
    a.occurred_at,
    nullif(a.metadata->>'completedAt', '')::timestamptz as completed_at,
    coalesce(a.metadata->>'status', 'open') as execution_status,
    nullif(a.metadata->>'outcomeStatus', '') as outcome_status,
    nullif(a.metadata->>'outcome', '') as outcome,
    nullif(a.metadata->>'fromStage', '') as action_from_stage,
    nullif(a.metadata->>'toStage', '') as action_to_stage,
    nullif(a.metadata->>'requestedStage', '') as action_requested_stage,
    nullif(a.metadata->>'resultFromStage', '') as result_from_stage,
    nullif(a.metadata->>'resultToStage', '') as result_to_stage,
    nullif(a.metadata->>'resultRequestedStage', '') as result_requested_stage,
    nullif(a.metadata->>'requestedNextAction', '') as action_requested_next_action,
    nullif(a.metadata->>'actualNextAction', '') as action_actual_next_action,
    nullif(a.metadata->>'resultRequestedNextAction', '') as result_requested_next_action,
    nullif(a.metadata->>'resultActualNextAction', '') as result_actual_next_action,
    a.metadata->'outcomeContext' as captured_context,
    p.expected_structure as current_pipeline_structure,
    p.expected_ticket as current_expected_ticket
  from public.activities a
  join public.knowledge_references kr
    on kr.reference_type = 'activity'
   and kr.reference_id = a.id
  join public.knowledge_nodes n
    on n.id = kr.node_id
   and n.status = 'active'
  join public.companies c on c.id = a.company_id
  left join public.pipeline p on p.id = a.pipeline_id
  where a.metadata->>'origin' = 'knowledge_vault'
), enriched as (
  select
    base.*,
    coalesce(base.captured_context, jsonb_build_object(
      'schemaVersion', 0,
      'contextMode', 'reconstructed_current',
      'node', jsonb_build_object(
        'id', base.node_id,
        'type', base.node_type,
        'title', base.node_title,
        'tags', to_jsonb(base.node_tags)
      )
    )) as context_snapshot
  from base
)
select
  enriched.activity_id,
  enriched.company_id,
  enriched.company_name,
  enriched.pipeline_id,
  enriched.node_id,
  enriched.node_title,
  enriched.node_type,
  enriched.node_tags,
  enriched.activity_type,
  enriched.activity_title,
  enriched.description,
  enriched.owner_name,
  enriched.occurred_at,
  enriched.completed_at,
  enriched.execution_status,
  enriched.outcome_status,
  enriched.outcome,
  case
    when enriched.outcome_status = 'won' then 'won'
    when enriched.outcome_status = 'lost' then 'lost'
    when enriched.outcome_status = 'blocked' then 'blocked'
    when enriched.outcome_status = 'progress' then 'progress'
    when enriched.outcome_status = 'no_change' then 'no_change'
    else 'open'
  end as observed_result_class,
  enriched.outcome_status in ('won', 'lost') as is_terminal_decision,
  enriched.action_from_stage,
  enriched.action_to_stage,
  enriched.action_requested_stage,
  enriched.result_from_stage,
  enriched.result_to_stage,
  enriched.result_requested_stage,
  case
    when enriched.result_from_stage is null or enriched.result_to_stage is null then null
    else (
      case enriched.result_to_stage
        when 'Identified' then 1 when 'Qualified' then 2 when 'Approach' then 3
        when 'Structuring' then 4 when 'Mandated' then 5 when 'ClosedWon' then 6
        when 'ClosedLost' then 6 when 'Recycled' then 1 else 0 end
      >
      case enriched.result_from_stage
        when 'Identified' then 1 when 'Qualified' then 2 when 'Approach' then 3
        when 'Structuring' then 4 when 'Mandated' then 5 when 'ClosedWon' then 6
        when 'ClosedLost' then 6 when 'Recycled' then 1 else 0 end
    )
  end as stage_advanced,
  enriched.action_requested_next_action,
  enriched.action_actual_next_action,
  enriched.result_requested_next_action,
  enriched.result_actual_next_action,
  coalesce(
    enriched.context_snapshot->'qualification'->>'suggestedStructure',
    enriched.context_snapshot->'leadScore'->>'suggestedStructure',
    enriched.context_snapshot->'pipeline'->>'expectedStructure',
    enriched.current_pipeline_structure
  ) as suggested_structure,
  coalesce(
    nullif(enriched.context_snapshot->'qualification'->>'score', '')::numeric,
    nullif(enriched.context_snapshot->'leadScore'->>'score', '')::numeric
  ) as decision_score,
  coalesce(
    nullif(enriched.context_snapshot->'pipeline'->>'expectedTicket', '')::numeric,
    enriched.current_expected_ticket
  ) as expected_ticket,
  coalesce(array(
    select distinct element->>'type'
    from jsonb_array_elements(coalesce(enriched.context_snapshot->'linkedSignals', '[]'::jsonb)) element
    where nullif(element->>'type', '') is not null
  ), array[]::text[]) as signal_types,
  coalesce(array(
    select distinct element->>'code'
    from jsonb_array_elements(coalesce(enriched.context_snapshot->'patterns', '[]'::jsonb)) element
    where nullif(element->>'code', '') is not null
  ), array[]::text[]) as pattern_codes,
  coalesce(array(
    select distinct element->>'code'
    from jsonb_array_elements(coalesce(enriched.context_snapshot->'factors', '[]'::jsonb)) element
    where nullif(element->>'code', '') is not null
  ), array[]::text[]) as factor_codes,
  coalesce(enriched.context_snapshot->>'contextMode', 'reconstructed_current') as context_mode,
  enriched.context_snapshot,
  case
    when enriched.completed_at is null then null
    else round((extract(epoch from (enriched.completed_at - enriched.occurred_at)) / 86400.0)::numeric, 2)
  end as cycle_days
from enriched;

comment on view public.knowledge_execution_outcomes_v1
is 'One row per knowledge-linked execution. Associations are observational; captured_at_action context is preferred over reconstructed context.';

create or replace view public.knowledge_outcome_dimension_map_v1
with (security_invoker = true)
as
with dimension_rows as (
  select o.*, 'action_type'::text as dimension_type, o.activity_type::text as dimension_value
  from public.knowledge_execution_outcomes_v1 o
  union all
  select o.*, 'node_type'::text, o.node_type::text
  from public.knowledge_execution_outcomes_v1 o
  union all
  select o.*, 'structure'::text, o.suggested_structure::text
  from public.knowledge_execution_outcomes_v1 o
  where nullif(o.suggested_structure, '') is not null
  union all
  select o.*, 'signal_type'::text, signal_type
  from public.knowledge_execution_outcomes_v1 o
  cross join lateral unnest(o.signal_types) signal_type
  union all
  select o.*, 'pattern'::text, pattern_code
  from public.knowledge_execution_outcomes_v1 o
  cross join lateral unnest(o.pattern_codes) pattern_code
  union all
  select o.*, 'factor'::text, factor_code
  from public.knowledge_execution_outcomes_v1 o
  cross join lateral unnest(o.factor_codes) factor_code
)
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
  round(
    count(*) filter (where outcome_status = 'won')::numeric
    / nullif(count(*) filter (where outcome_status in ('won', 'lost')), 0),
    4
  ) as observed_win_rate,
  round(
    count(*) filter (where stage_advanced is true)::numeric
    / nullif(count(*) filter (where stage_advanced is not null), 0),
    4
  ) as observed_stage_advance_rate,
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
group by dimension_type, dimension_value;

comment on view public.knowledge_outcome_dimension_map_v1
is 'Observed execution outcomes grouped by action, note, structure, signal, pattern and factor. Rates are descriptive associations, never causal estimates.';

revoke all on public.knowledge_execution_outcomes_v1 from public, anon;
revoke all on public.knowledge_outcome_dimension_map_v1 from public, anon;
grant select on public.knowledge_execution_outcomes_v1 to authenticated, service_role;
grant select on public.knowledge_outcome_dimension_map_v1 to authenticated, service_role;
