-- Knowledge Vault V6: observational outcome intelligence.
-- Captures the decision context at action creation and exposes association maps.
-- This layer never rewrites scores, factor weights, qualification or ranking.

create or replace function public.knowledge_build_execution_context(
  p_company_id uuid,
  p_node_id uuid
)
returns jsonb
language plpgsql
security invoker
stable
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  node_row public.knowledge_nodes%rowtype;
  result jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into node_row
  from public.knowledge_nodes
  where id = p_node_id
    and company_id = p_company_id
    and status = 'active';

  if not found then
    raise exception 'Knowledge node not found, inaccessible or linked to another company: %', p_node_id;
  end if;

  select jsonb_strip_nulls(jsonb_build_object(
    'schemaVersion', 1,
    'capturedAt', now(),
    'contextMode', 'captured_at_action',
    'node', jsonb_build_object(
      'id', node_row.id,
      'type', node_row.node_type,
      'title', node_row.title,
      'tags', to_jsonb(coalesce(node_row.tags, array[]::text[]))
    ),
    'qualification', (
      select jsonb_build_object(
        'id', q.id,
        'score', coalesce(q.qualification_score_total, q.total_score),
        'fundingNeedScore', q.predicted_funding_need_score,
        'urgencyScore', q.urgency_score,
        'sourceConfidenceScore', coalesce(q.source_confidence_score, q.confidence_score),
        'suggestedStructure', q.suggested_structure_type,
        'fitFidc', q.fit_fidc,
        'fitDcm', q.fit_dcm,
        'fundingGapLevel', q.funding_gap_level,
        'createdAt', q.created_at
      )
      from public.qualification_snapshots q
      where q.company_id = p_company_id
        and q.created_at <= now()
      order by q.created_at desc, q.id desc
      limit 1
    ),
    'leadScore', (
      select jsonb_build_object(
        'id', l.id,
        'score', l.lead_score,
        'bucket', coalesce(l.bucket, l.priority_tier),
        'triggerStrength', l.trigger_strength,
        'patternScore', l.pattern_score,
        'sourceConfidence', l.source_confidence,
        'suggestedStructure', l.suggested_structure,
        'createdAt', l.created_at
      )
      from public.lead_score_snapshots l
      where l.company_id = p_company_id
        and l.created_at <= now()
      order by l.created_at desc, l.id desc
      limit 1
    ),
    'pipeline', (
      select jsonb_build_object(
        'id', p.id,
        'stage', p.stage,
        'status', p.status,
        'priority', p.priority,
        'expectedStructure', p.expected_structure,
        'expectedTicket', p.expected_ticket,
        'nextAction', p.next_action,
        'nextActionDueAt', p.next_action_due_at,
        'updatedAt', p.updated_at
      )
      from public.pipeline p
      where p.company_id = p_company_id
      limit 1
    ),
    'linkedSignals', coalesce((
      select jsonb_agg(signal_item.item order by signal_item.observed_at desc)
      from (
        select
          jsonb_build_object(
            'id', s.id,
            'type', s.signal_type,
            'label', s.signal_label,
            'strength', coalesce(s.signal_strength, s.strength),
            'confidence', coalesce(s.confidence_score, s.confidence),
            'nature', s.observed_vs_inferred,
            'observedAt', s.observed_at
          ) as item,
          s.observed_at
        from public.knowledge_references kr
        join public.company_signals s
          on kr.reference_type = 'company_signal'
         and kr.reference_id = s.id
         and s.company_id = p_company_id
        where kr.node_id = p_node_id
        order by s.observed_at desc, s.id desc
        limit 12
      ) signal_item
    ), '[]'::jsonb),
    'patterns', coalesce((
      select jsonb_agg(pattern_item.item order by pattern_item.confidence desc, pattern_item.detected_at desc)
      from (
        select
          jsonb_build_object(
            'id', latest.pattern_id,
            'code', pc.code,
            'name', coalesce(pc.pattern_name, pc.name),
            'family', pc.pattern_family,
            'confidence', latest.confidence,
            'detectedAt', latest.detected_at
          ) as item,
          latest.confidence,
          latest.detected_at
        from (
          select distinct on (cp.pattern_id)
            cp.pattern_id,
            coalesce(cp.confidence_score, cp.confidence, 0) as confidence,
            coalesce(cp.detected_at, cp.created_at) as detected_at
          from public.company_patterns cp
          where cp.company_id = p_company_id
            and coalesce(cp.detected_at, cp.created_at) <= now()
          order by cp.pattern_id, coalesce(cp.detected_at, cp.created_at) desc, cp.id desc
        ) latest
        join public.pattern_catalog pc on pc.id = latest.pattern_id
        order by latest.confidence desc, latest.detected_at desc
        limit 12
      ) pattern_item
    ), '[]'::jsonb),
    'factors', coalesce((
      select jsonb_agg(factor_item.item order by factor_item.abs_contribution desc, factor_item.latest_observed_at desc)
      from (
        select
          jsonb_build_object(
            'id', latest.factor_id,
            'code', f.code,
            'name', f.name,
            'dimension', f.dimension,
            'score', latest.score,
            'netContribution', latest.net_contribution,
            'confidence', latest.confidence_score,
            'latestObservedAt', latest.latest_observed_at
          ) as item,
          abs(coalesce(latest.net_contribution, 0)) as abs_contribution,
          latest.latest_observed_at
        from (
          select distinct on (fs.factor_id)
            fs.factor_id,
            fs.score,
            fs.net_contribution,
            fs.confidence_score,
            fs.latest_observed_at
          from public.company_factor_snapshots fs
          where fs.company_id = p_company_id
            and fs.created_at <= now()
          order by fs.factor_id, fs.snapshot_date desc, fs.updated_at desc, fs.id desc
        ) latest
        join public.origination_factor_catalog f on f.id = latest.factor_id
        order by abs(coalesce(latest.net_contribution, 0)) desc, latest.latest_observed_at desc
        limit 16
      ) factor_item
    ), '[]'::jsonb)
  )) into result;

  return result;
end;
$$;

comment on function public.knowledge_build_execution_context(uuid, uuid)
is 'Captures the observable decision context at the moment a knowledge execution action is created. It does not infer causality or modify scores.';

create or replace function public.knowledge_hydrate_execution_context()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  node_id uuid;
  context_snapshot jsonb;
begin
  if tg_op = 'UPDATE' and old.metadata ? 'outcomeContext' then
    new.metadata := jsonb_set(
      coalesce(new.metadata, '{}'::jsonb),
      '{outcomeContext}',
      old.metadata->'outcomeContext',
      true
    );
    return new;
  end if;

  if coalesce(new.metadata->>'origin', '') <> 'knowledge_vault'
     or new.metadata ? 'outcomeContext' then
    return new;
  end if;

  node_id := nullif(new.metadata->>'knowledgeNodeId', '')::uuid;
  if node_id is null then
    raise exception 'knowledgeNodeId is required for knowledge_vault activities';
  end if;

  context_snapshot := public.knowledge_build_execution_context(new.company_id, node_id);
  if tg_op = 'UPDATE' then
    context_snapshot := jsonb_set(context_snapshot, '{contextMode}', to_jsonb('reconstructed_on_update'::text), true);
  end if;
  context_snapshot := context_snapshot || jsonb_build_object(
    'actionRequest', jsonb_build_object(
      'fromStage', new.metadata->>'fromStage',
      'requestedStage', new.metadata->>'requestedStage',
      'effectiveStage', new.metadata->>'toStage',
      'requestedNextAction', new.metadata->>'requestedNextAction',
      'effectiveNextAction', new.metadata->>'actualNextAction',
      'dueAt', new.metadata->>'dueAt'
    )
  );

  new.metadata := new.metadata || jsonb_build_object('outcomeContext', context_snapshot);
  return new;
end;
$$;

drop trigger if exists trg_knowledge_hydrate_execution_context on public.activities;
create trigger trg_knowledge_hydrate_execution_context
before insert or update of metadata on public.activities
for each row
execute function public.knowledge_hydrate_execution_context();

comment on function public.knowledge_hydrate_execution_context()
is 'Captures and then preserves the execution context snapshot for knowledge_vault activities.';

create index if not exists idx_activities_knowledge_outcome_window
  on public.activities (occurred_at desc, company_id)
  where metadata->>'origin' = 'knowledge_vault';

revoke all on function public.knowledge_build_execution_context(uuid, uuid) from public, anon;
revoke all on function public.knowledge_hydrate_execution_context() from public, anon, authenticated;
grant execute on function public.knowledge_build_execution_context(uuid, uuid) to authenticated, service_role;
