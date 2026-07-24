-- Knowledge Vault V8: prioritized outcome workbench and atomic historical outcome capture.
-- Priority is an operational ordering heuristic only. It never changes lead score,
-- qualification, patterns, ranking, pipeline stage or model weights.

create or replace function public.knowledge_outcome_operations(
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

  with latest_lead as (
    select distinct on (l.company_id)
      l.company_id,
      l.lead_score,
      coalesce(l.bucket, l.priority_tier) as lead_bucket,
      l.suggested_structure,
      l.created_at
    from public.lead_score_snapshots l
    where l.created_at <= now()
    order by l.company_id, l.created_at desc, l.id desc
  ), latest_qualification as (
    select distinct on (q.company_id)
      q.company_id,
      coalesce(q.qualification_score_total, q.total_score) as qualification_score,
      q.urgency_score,
      q.predicted_funding_need_score as funding_need_score,
      q.suggested_structure_type,
      q.created_at
    from public.qualification_snapshots q
    where q.created_at <= now()
    order by q.company_id, q.created_at desc, q.id desc
  ), task_counts as (
    select
      t.company_id,
      count(*) filter (where t.status not in ('done', 'completed', 'cancelled'))::integer as open_task_count,
      count(*) filter (
        where t.status not in ('done', 'completed', 'cancelled')
          and t.due_at < now()
      )::integer as overdue_task_count
    from public.tasks t
    group by t.company_id
  ), company_context as (
    select
      c.id as company_id,
      effective_pipeline.id as pipeline_id,
      effective_pipeline.stage as pipeline_stage,
      effective_pipeline.status as pipeline_status,
      effective_pipeline.priority as pipeline_priority,
      effective_pipeline.expected_structure,
      effective_pipeline.expected_ticket,
      effective_pipeline.next_action,
      effective_pipeline.next_action_due_at,
      ll.lead_score,
      ll.lead_bucket,
      lq.qualification_score,
      lq.urgency_score,
      lq.funding_need_score,
      coalesce(tc.open_task_count, 0) as open_task_count,
      coalesce(tc.overdue_task_count, 0) as overdue_task_count
    from public.companies c
    left join lateral (
      select p.*
      from public.pipeline p
      where p.company_id = c.id
      order by
        case when p.status = 'active' then 0 else 1 end,
        p.updated_at desc,
        p.id desc
      limit 1
    ) effective_pipeline on true
    left join latest_lead ll on ll.company_id = c.id
    left join latest_qualification lq on lq.company_id = c.id
    left join task_counts tc on tc.company_id = c.id
    where p_company_id is null or c.id = p_company_id
  ), pending_base as (
    select
      o.activity_id,
      o.company_id,
      o.company_name,
      o.node_id,
      o.node_title,
      o.activity_type,
      o.activity_title,
      o.description,
      o.owner_name,
      o.occurred_at,
      o.context_mode,
      task_row.task_id,
      task_row.task_status,
      task_row.due_at,
      greatest(0, floor(extract(epoch from (now() - o.occurred_at)) / 86400.0))::integer as age_days,
      cc.pipeline_id,
      cc.pipeline_stage,
      cc.pipeline_priority,
      cc.expected_structure,
      cc.expected_ticket,
      cc.lead_score,
      cc.lead_bucket,
      cc.qualification_score,
      cc.urgency_score,
      cc.funding_need_score,
      cc.open_task_count,
      cc.overdue_task_count
    from public.knowledge_execution_outcomes_v1 o
    join company_context cc on cc.company_id = o.company_id
    left join lateral (
      select t.id as task_id, t.status as task_status, t.due_at
      from public.tasks t
      where t.metadata->>'knowledgeActivityId' = o.activity_id::text
        and t.status not in ('done', 'completed', 'cancelled')
      order by t.due_at nulls last, t.created_at desc
      limit 1
    ) task_row on true
    where o.outcome_status is null
      and o.occurred_at >= now() - make_interval(days => p_days)
  ), adoption_base as (
    select
      a.id as activity_id,
      a.company_id,
      coalesce(c.trade_name, c.legal_name) as company_name,
      cc.pipeline_id,
      a.activity_type,
      a.title,
      a.description,
      a.owner_name,
      a.occurred_at,
      greatest(0, floor(extract(epoch from (now() - a.occurred_at)) / 86400.0))::integer as age_days,
      cc.pipeline_stage,
      cc.pipeline_priority,
      cc.expected_structure,
      cc.expected_ticket,
      cc.lead_score,
      cc.lead_bucket,
      cc.qualification_score,
      cc.urgency_score,
      cc.funding_need_score,
      cc.open_task_count,
      cc.overdue_task_count
    from public.activities a
    join public.companies c on c.id = a.company_id
    join company_context cc on cc.company_id = a.company_id
    where a.occurred_at >= now() - make_interval(days => p_days)
      and coalesce(a.metadata->>'status', 'open') <> 'done'
      and nullif(a.metadata->>'outcomeStatus', '') is null
      and not exists (
        select 1
        from public.knowledge_references kr
        where kr.reference_type = 'activity'
          and kr.reference_id = a.id
      )
  ), pending_scored as (
    select
      pb.*,
      least(100, greatest(0,
        case
          when pb.pipeline_stage in ('Structuring', 'Mandated') then 18
          when pb.pipeline_stage = 'Approach' then 14
          when pb.pipeline_stage = 'Qualified' then 8
          else 4
        end
        + case
          when pb.pipeline_priority in ('immediate', 'priority_1', 'high', 'hot', 'A', 'high_priority') then 18
          when pb.pipeline_priority = 'monitor_closely' then 8
          else 3
        end
        + case when pb.lead_score >= 80 then 15 when pb.lead_score >= 70 then 12 when pb.lead_score >= 60 then 8 else 3 end
        + case when pb.qualification_score >= 80 then 12 when pb.qualification_score >= 75 then 10 when pb.qualification_score >= 70 then 7 else 3 end
        + case when pb.urgency_score >= 70 then 10 when pb.urgency_score >= 60 then 7 when pb.urgency_score >= 50 then 4 else 1 end
        + case when pb.funding_need_score >= 85 then 12 when pb.funding_need_score >= 75 then 8 else 3 end
        + case
          when pb.activity_type = 'committee' then 12
          when pb.activity_type in ('meeting', 'call') then 10
          when pb.activity_type in ('email', 'follow_up') then 7
          when pb.activity_type in ('document', 'research') then 5
          else 3
        end
        + least(12, pb.overdue_task_count * 6)
        + case when pb.open_task_count > 0 then 3 else 0 end
        + case when pb.age_days <= 30 then 8 when pb.age_days <= 60 then 5 when pb.age_days <= 90 then 3 else 1 end
      ))::integer as priority_score,
      array_remove(array[
        case when pb.pipeline_priority in ('immediate', 'priority_1', 'high', 'hot', 'A', 'high_priority') then 'pipeline em alta prioridade' end,
        case when pb.pipeline_stage in ('Approach', 'Structuring', 'Mandated') then 'estágio comercial avançado' end,
        case when pb.funding_need_score >= 85 then 'necessidade de funding elevada' end,
        case when pb.urgency_score >= 60 then 'urgência relevante' end,
        case when pb.lead_score >= 70 then 'lead score elevado' end,
        case when pb.overdue_task_count > 0 then format('%s tarefa(s) vencida(s)', pb.overdue_task_count) end,
        case when pb.activity_type in ('committee', 'meeting', 'call') then 'interação comercial de alta informação' end,
        case when pb.context_mode <> 'captured_at_action' then 'contexto reconstruído exige validação' end
      ]::text[], null) as priority_reasons
    from pending_base pb
  ), adoption_scored as (
    select
      ab.*,
      least(100, greatest(0,
        case
          when ab.pipeline_stage in ('Structuring', 'Mandated') then 18
          when ab.pipeline_stage = 'Approach' then 14
          when ab.pipeline_stage = 'Qualified' then 8
          else 4
        end
        + case
          when ab.pipeline_priority in ('immediate', 'priority_1', 'high', 'hot', 'A', 'high_priority') then 18
          when ab.pipeline_priority = 'monitor_closely' then 8
          else 3
        end
        + case when ab.lead_score >= 80 then 15 when ab.lead_score >= 70 then 12 when ab.lead_score >= 60 then 8 else 3 end
        + case when ab.qualification_score >= 80 then 12 when ab.qualification_score >= 75 then 10 when ab.qualification_score >= 70 then 7 else 3 end
        + case when ab.urgency_score >= 70 then 10 when ab.urgency_score >= 60 then 7 when ab.urgency_score >= 50 then 4 else 1 end
        + case when ab.funding_need_score >= 85 then 12 when ab.funding_need_score >= 75 then 8 else 3 end
        + case
          when ab.activity_type = 'committee' then 12
          when ab.activity_type in ('meeting', 'call') then 10
          when ab.activity_type in ('email', 'follow_up') then 7
          when ab.activity_type in ('document', 'research') then 5
          else 3
        end
        + least(12, ab.overdue_task_count * 6)
        + case when ab.open_task_count > 0 then 3 else 0 end
        + case when ab.age_days <= 30 then 8 when ab.age_days <= 60 then 5 when ab.age_days <= 90 then 3 else 1 end
      ))::integer as priority_score,
      array_remove(array[
        case when ab.pipeline_priority in ('immediate', 'priority_1', 'high', 'hot', 'A', 'high_priority') then 'pipeline em alta prioridade' end,
        case when ab.pipeline_stage in ('Approach', 'Structuring', 'Mandated') then 'estágio comercial avançado' end,
        case when ab.funding_need_score >= 85 then 'necessidade de funding elevada' end,
        case when ab.urgency_score >= 60 then 'urgência relevante' end,
        case when ab.lead_score >= 70 then 'lead score elevado' end,
        case when ab.overdue_task_count > 0 then format('%s tarefa(s) vencida(s)', ab.overdue_task_count) end,
        case when ab.activity_type in ('committee', 'meeting', 'call') then 'interação comercial de alta informação' end,
        'atividade histórica fora do aprendizado'
      ]::text[], null) as priority_reasons
    from adoption_base ab
    where ab.pipeline_id is not null
  ), pending_ranked as (
    select
      ps.*,
      case when ps.priority_score >= 80 then 'immediate'
           when ps.priority_score >= 65 then 'high'
           when ps.priority_score >= 45 then 'review'
           else 'low' end as priority_band,
      case when ps.priority_score >= 65 then 'capture_outcome_now' else 'review_context' end as suggested_handling
    from pending_scored ps
  ), adoption_ranked as (
    select
      ads.*,
      case when ads.priority_score >= 80 then 'immediate'
           when ads.priority_score >= 65 then 'high'
           when ads.priority_score >= 45 then 'review'
           else 'low' end as priority_band,
      case when ads.priority_score >= 65 then 'capture_outcome_now' else 'review_context' end as suggested_handling
    from adoption_scored ads
  ), open_tasks as (
    select
      t.id as task_id,
      t.company_id,
      coalesce(c.trade_name, c.legal_name) as company_name,
      t.pipeline_id,
      t.title,
      t.description,
      t.status,
      t.priority,
      t.due_at,
      t.owner_name,
      nullif(t.metadata->>'knowledgeActivityId', '')::uuid as knowledge_activity_id
    from public.tasks t
    join public.companies c on c.id = t.company_id
    where t.status not in ('done', 'completed', 'cancelled')
      and (p_company_id is null or t.company_id = p_company_id)
  ), stale_pipelines as (
    select
      cc.pipeline_id,
      cc.company_id,
      coalesce(c.trade_name, c.legal_name) as company_name,
      cc.pipeline_stage as stage,
      cc.pipeline_status as status,
      cc.pipeline_priority as priority,
      cc.next_action,
      cc.next_action_due_at,
      cc.expected_structure,
      case
        when nullif(btrim(coalesce(cc.next_action, '')), '') is null then 'missing_next_action'
        when cc.next_action_due_at < now() then 'overdue_next_action'
        else 'current'
      end as reason
    from company_context cc
    join public.companies c on c.id = cc.company_id
    where cc.pipeline_id is not null
      and cc.pipeline_status = 'active'
      and cc.pipeline_stage not in ('ClosedWon', 'ClosedLost')
      and (
        nullif(btrim(coalesce(cc.next_action, '')), '') is null
        or cc.next_action_due_at < now()
      )
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'scope', case when p_company_id is null then 'global' else 'company' end,
    'companyId', p_company_id,
    'windowDays', p_days,
    'summary', jsonb_build_object(
      'pendingOutcomes', (select count(*)::integer from pending_ranked),
      'overdueTasks', (select count(*)::integer from open_tasks where due_at < now()),
      'dueSoonTasks', (select count(*)::integer from open_tasks where due_at >= now() and due_at <= now() + interval '7 days'),
      'stalePipelines', (select count(*)::integer from stale_pipelines),
      'adoptionCandidates', (select count(*)::integer from adoption_ranked),
      'immediateCandidates', (select count(*)::integer from adoption_ranked where priority_band = 'immediate'),
      'highPriorityCandidates', (select count(*)::integer from adoption_ranked where priority_band in ('immediate', 'high')),
      'dailyQueueItems',
        (select count(*)::integer from pending_ranked)
        + (select count(*)::integer from adoption_ranked where priority_band in ('immediate', 'high'))
        + (select count(*)::integer from open_tasks where due_at < now() and knowledge_activity_id is null)
    ),
    'pendingOutcomes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'activityId', q.activity_id,
        'companyId', q.company_id,
        'companyName', q.company_name,
        'nodeId', q.node_id,
        'nodeTitle', q.node_title,
        'activityType', q.activity_type,
        'title', q.activity_title,
        'description', q.description,
        'ownerName', q.owner_name,
        'occurredAt', q.occurred_at,
        'contextMode', q.context_mode,
        'taskId', q.task_id,
        'taskStatus', q.task_status,
        'dueAt', q.due_at,
        'ageDays', q.age_days,
        'pipelineId', q.pipeline_id,
        'pipelineStage', q.pipeline_stage,
        'pipelinePriority', q.pipeline_priority,
        'expectedStructure', q.expected_structure,
        'expectedTicket', q.expected_ticket,
        'leadScore', q.lead_score,
        'leadBucket', q.lead_bucket,
        'qualificationScore', q.qualification_score,
        'urgencyScore', q.urgency_score,
        'fundingNeedScore', q.funding_need_score,
        'openTaskCount', q.open_task_count,
        'overdueTaskCount', q.overdue_task_count,
        'priorityScore', q.priority_score,
        'priorityBand', q.priority_band,
        'priorityReasons', to_jsonb(q.priority_reasons),
        'suggestedHandling', q.suggested_handling
      ) order by q.priority_score desc, q.due_at nulls first, q.occurred_at)
      from (
        select * from pending_ranked
        order by priority_score desc, due_at nulls first, occurred_at
        limit 30
      ) q
    ), '[]'::jsonb),
    'overdueTasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'taskId', q.task_id,
        'companyId', q.company_id,
        'companyName', q.company_name,
        'pipelineId', q.pipeline_id,
        'title', q.title,
        'description', q.description,
        'status', q.status,
        'priority', q.priority,
        'dueAt', q.due_at,
        'ownerName', q.owner_name,
        'knowledgeActivityId', q.knowledge_activity_id,
        'isOutcomeTask', q.knowledge_activity_id is not null
      ) order by q.due_at)
      from (
        select * from open_tasks
        where due_at < now()
        order by due_at
        limit 30
      ) q
    ), '[]'::jsonb),
    'dueSoonTasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'taskId', q.task_id,
        'companyId', q.company_id,
        'companyName', q.company_name,
        'pipelineId', q.pipeline_id,
        'title', q.title,
        'description', q.description,
        'status', q.status,
        'priority', q.priority,
        'dueAt', q.due_at,
        'ownerName', q.owner_name,
        'knowledgeActivityId', q.knowledge_activity_id,
        'isOutcomeTask', q.knowledge_activity_id is not null
      ) order by q.due_at)
      from (
        select * from open_tasks
        where due_at >= now()
          and due_at <= now() + interval '7 days'
        order by due_at
        limit 30
      ) q
    ), '[]'::jsonb),
    'stalePipelines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'pipelineId', q.pipeline_id,
        'companyId', q.company_id,
        'companyName', q.company_name,
        'stage', q.stage,
        'status', q.status,
        'priority', q.priority,
        'nextAction', q.next_action,
        'nextActionDueAt', q.next_action_due_at,
        'expectedStructure', q.expected_structure,
        'reason', q.reason
      ) order by q.next_action_due_at nulls first, q.company_name)
      from (
        select * from stale_pipelines
        order by next_action_due_at nulls first, company_name
        limit 30
      ) q
    ), '[]'::jsonb),
    'adoptionCandidates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'activityId', q.activity_id,
        'companyId', q.company_id,
        'companyName', q.company_name,
        'pipelineId', q.pipeline_id,
        'activityType', q.activity_type,
        'title', q.title,
        'description', q.description,
        'ownerName', q.owner_name,
        'occurredAt', q.occurred_at,
        'ageDays', q.age_days,
        'canAdopt', q.pipeline_id is not null,
        'pipelineStage', q.pipeline_stage,
        'pipelinePriority', q.pipeline_priority,
        'expectedStructure', q.expected_structure,
        'expectedTicket', q.expected_ticket,
        'leadScore', q.lead_score,
        'leadBucket', q.lead_bucket,
        'qualificationScore', q.qualification_score,
        'urgencyScore', q.urgency_score,
        'fundingNeedScore', q.funding_need_score,
        'openTaskCount', q.open_task_count,
        'overdueTaskCount', q.overdue_task_count,
        'priorityScore', q.priority_score,
        'priorityBand', q.priority_band,
        'priorityReasons', to_jsonb(q.priority_reasons),
        'suggestedHandling', q.suggested_handling
      ) order by q.priority_score desc, q.occurred_at desc)
      from (
        select * from adoption_ranked
        order by priority_score desc, occurred_at desc
        limit 50
      ) q
    ), '[]'::jsonb),
    'caveat', 'Prioridade operacional determinística e explicável. A ordenação não muda lead score, qualification, ranking, estágio ou pesos do modelo. Outcomes continuam dependentes de confirmação humana.'
  ) into result;

  return result;
end;
$$;

comment on function public.knowledge_outcome_operations(uuid, integer)
is 'Returns a deterministic prioritized workbench for real outcome capture. Priority is operational ordering only and never rewrites decision engines.';

create or replace function public.knowledge_capture_existing_activity_outcome(
  p_activity_id uuid,
  p_adoption_idempotency_key text,
  p_completion_idempotency_key text,
  p_outcome_status text,
  p_outcome text,
  p_next_action text default null,
  p_due_at timestamptz default null,
  p_target_stage text default null,
  p_node_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  activity_row public.activities%rowtype;
  adoption_result jsonb;
  execution_workspace jsonb;
  company_operations jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_adoption_idempotency_key is null
     or length(btrim(p_adoption_idempotency_key)) < 8
     or length(p_adoption_idempotency_key) > 160 then
    raise exception 'Invalid adoption idempotency key';
  end if;

  if p_completion_idempotency_key is null
     or length(btrim(p_completion_idempotency_key)) < 8
     or length(p_completion_idempotency_key) > 160 then
    raise exception 'Invalid completion idempotency key';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('knowledge:outcome:workbench:' || p_activity_id::text, 0));

  select * into activity_row
  from public.activities
  where id = p_activity_id
  for update;

  if not found or activity_row.company_id is null then
    raise exception 'Activity not found, inaccessible or not linked to a company: %', p_activity_id;
  end if;

  if activity_row.metadata->>'completionIdempotencyKey' = btrim(p_completion_idempotency_key)
     or coalesce(activity_row.metadata->>'status', 'open') = 'done' then
    return jsonb_build_object(
      'status', 'already_completed',
      'activityId', activity_row.id,
      'companyId', activity_row.company_id,
      'outcomeStatus', nullif(activity_row.metadata->>'outcomeStatus', ''),
      'completedAt', nullif(activity_row.metadata->>'completedAt', ''),
      'workspace', public.knowledge_company_execution_workspace(activity_row.company_id),
      'operations', public.knowledge_outcome_operations(activity_row.company_id, 365)
    );
  end if;

  adoption_result := public.knowledge_adopt_existing_activity(
    p_activity_id,
    p_adoption_idempotency_key,
    p_node_id
  );

  execution_workspace := public.knowledge_complete_execution_action(
    p_activity_id,
    p_completion_idempotency_key,
    p_outcome_status,
    p_outcome,
    p_next_action,
    p_due_at,
    p_target_stage
  );

  company_operations := public.knowledge_outcome_operations(activity_row.company_id, 365);

  return jsonb_build_object(
    'status', 'completed',
    'activityId', activity_row.id,
    'companyId', activity_row.company_id,
    'adoptionStatus', adoption_result->>'status',
    'nodeId', adoption_result->>'nodeId',
    'contextMode', adoption_result->>'contextMode',
    'outcomeStatus', p_outcome_status,
    'completedAt', now(),
    'workspace', execution_workspace,
    'operations', company_operations
  );
end;
$$;

comment on function public.knowledge_capture_existing_activity_outcome(uuid, text, text, text, text, text, timestamptz, text, uuid)
is 'Atomically instruments an existing activity when needed and records a user-confirmed outcome. No outcome, stage or next action is inferred.';

revoke all on function public.knowledge_outcome_operations(uuid, integer) from public, anon;
revoke all on function public.knowledge_capture_existing_activity_outcome(uuid, text, text, text, text, text, timestamptz, text, uuid) from public, anon;
grant execute on function public.knowledge_outcome_operations(uuid, integer) to authenticated, service_role;
grant execute on function public.knowledge_capture_existing_activity_outcome(uuid, text, text, text, text, text, timestamptz, text, uuid) to authenticated, service_role;
