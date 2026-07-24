-- Knowledge Vault V7: operational outcome capture queue.
-- Surfaces pending results and lets authenticated users explicitly instrument
-- existing activities without pretending their historical context was captured at creation.

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
     or a.metadata->>'outcomeInstrumentationOrigin' = 'knowledge_vault_v7'
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
is 'One row per knowledge-linked execution, including explicitly instrumented historical activities. Historical adoption is marked reconstructed_at_adoption and never represented as captured-at-action context.';

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

  with pending_outcomes as (
    select o.activity_id, o.company_id, o.company_name, o.node_id, o.node_title,
      o.activity_type, o.activity_title, o.description, o.owner_name, o.occurred_at,
      o.context_mode, task_row.task_id, task_row.task_status, task_row.due_at,
      greatest(0, floor(extract(epoch from (now() - o.occurred_at)) / 86400.0))::integer as age_days
    from public.knowledge_execution_outcomes_v1 o
    left join lateral (
      select t.id as task_id, t.status as task_status, t.due_at
      from public.tasks t
      where t.metadata->>'knowledgeActivityId' = o.activity_id::text
        and t.status not in ('done', 'completed', 'cancelled')
      order by t.due_at nulls last, t.created_at desc
      limit 1
    ) task_row on true
    where o.outcome_status is null
      and (p_company_id is null or o.company_id = p_company_id)
      and o.occurred_at >= now() - make_interval(days => p_days)
  ), open_tasks as (
    select t.id as task_id, t.company_id, coalesce(c.trade_name, c.legal_name) as company_name,
      t.pipeline_id, t.title, t.description, t.status, t.priority, t.due_at, t.owner_name,
      nullif(t.metadata->>'knowledgeActivityId', '')::uuid as knowledge_activity_id
    from public.tasks t
    join public.companies c on c.id = t.company_id
    where t.status not in ('done', 'completed', 'cancelled')
      and (p_company_id is null or t.company_id = p_company_id)
  ), stale_pipelines as (
    select p.id as pipeline_id, p.company_id, coalesce(c.trade_name, c.legal_name) as company_name,
      p.stage, p.status, p.priority, p.next_action, p.next_action_due_at, p.expected_structure,
      case
        when nullif(btrim(coalesce(p.next_action, '')), '') is null then 'missing_next_action'
        when p.next_action_due_at < now() then 'overdue_next_action'
        else 'current'
      end as reason
    from public.pipeline p
    join public.companies c on c.id = p.company_id
    where p.status = 'active'
      and p.stage not in ('ClosedWon', 'ClosedLost')
      and (p_company_id is null or p.company_id = p_company_id)
      and (nullif(btrim(coalesce(p.next_action, '')), '') is null or p.next_action_due_at < now())
  ), adoption_candidates as (
    select a.id as activity_id, a.company_id, coalesce(c.trade_name, c.legal_name) as company_name,
      a.pipeline_id, effective_pipeline.id as effective_pipeline_id, a.activity_type, a.title,
      a.description, a.owner_name, a.occurred_at,
      greatest(0, floor(extract(epoch from (now() - a.occurred_at)) / 86400.0))::integer as age_days
    from public.activities a
    join public.companies c on c.id = a.company_id
    left join lateral (
      select p.id
      from public.pipeline p
      where p.id = a.pipeline_id or (a.pipeline_id is null and p.company_id = a.company_id)
      order by case when p.id = a.pipeline_id then 0 else 1 end
      limit 1
    ) effective_pipeline on true
    where (p_company_id is null or a.company_id = p_company_id)
      and a.occurred_at >= now() - make_interval(days => p_days)
      and coalesce(a.metadata->>'status', 'open') <> 'done'
      and nullif(a.metadata->>'outcomeStatus', '') is null
      and not exists (
        select 1 from public.knowledge_references kr
        where kr.reference_type = 'activity' and kr.reference_id = a.id
      )
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'scope', case when p_company_id is null then 'global' else 'company' end,
    'companyId', p_company_id,
    'windowDays', p_days,
    'summary', jsonb_build_object(
      'pendingOutcomes', (select count(*)::integer from pending_outcomes),
      'overdueTasks', (select count(*)::integer from open_tasks where due_at < now()),
      'dueSoonTasks', (select count(*)::integer from open_tasks where due_at >= now() and due_at <= now() + interval '7 days'),
      'stalePipelines', (select count(*)::integer from stale_pipelines),
      'adoptionCandidates', (select count(*)::integer from adoption_candidates where effective_pipeline_id is not null)
    ),
    'pendingOutcomes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'activityId', q.activity_id, 'companyId', q.company_id, 'companyName', q.company_name,
        'nodeId', q.node_id, 'nodeTitle', q.node_title, 'activityType', q.activity_type,
        'title', q.activity_title, 'description', q.description, 'ownerName', q.owner_name,
        'occurredAt', q.occurred_at, 'contextMode', q.context_mode, 'taskId', q.task_id,
        'taskStatus', q.task_status, 'dueAt', q.due_at, 'ageDays', q.age_days
      ) order by q.due_at nulls first, q.occurred_at)
      from (select * from pending_outcomes order by due_at nulls first, occurred_at limit 20) q
    ), '[]'::jsonb),
    'overdueTasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'taskId', q.task_id, 'companyId', q.company_id, 'companyName', q.company_name,
        'pipelineId', q.pipeline_id, 'title', q.title, 'description', q.description,
        'status', q.status, 'priority', q.priority, 'dueAt', q.due_at, 'ownerName', q.owner_name,
        'knowledgeActivityId', q.knowledge_activity_id, 'isOutcomeTask', q.knowledge_activity_id is not null
      ) order by q.due_at)
      from (select * from open_tasks where due_at < now() order by due_at limit 20) q
    ), '[]'::jsonb),
    'dueSoonTasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'taskId', q.task_id, 'companyId', q.company_id, 'companyName', q.company_name,
        'pipelineId', q.pipeline_id, 'title', q.title, 'status', q.status, 'priority', q.priority,
        'dueAt', q.due_at, 'ownerName', q.owner_name, 'knowledgeActivityId', q.knowledge_activity_id,
        'isOutcomeTask', q.knowledge_activity_id is not null
      ) order by q.due_at)
      from (select * from open_tasks where due_at >= now() and due_at <= now() + interval '7 days' order by due_at limit 20) q
    ), '[]'::jsonb),
    'stalePipelines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'pipelineId', q.pipeline_id, 'companyId', q.company_id, 'companyName', q.company_name,
        'stage', q.stage, 'status', q.status, 'priority', q.priority, 'nextAction', q.next_action,
        'nextActionDueAt', q.next_action_due_at, 'expectedStructure', q.expected_structure, 'reason', q.reason
      ) order by q.next_action_due_at nulls first, q.company_name)
      from (select * from stale_pipelines order by next_action_due_at nulls first, company_name limit 20) q
    ), '[]'::jsonb),
    'adoptionCandidates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'activityId', q.activity_id, 'companyId', q.company_id, 'companyName', q.company_name,
        'pipelineId', q.effective_pipeline_id, 'activityType', q.activity_type, 'title', q.title,
        'description', q.description, 'ownerName', q.owner_name, 'occurredAt', q.occurred_at,
        'ageDays', q.age_days, 'canAdopt', q.effective_pipeline_id is not null
      ) order by q.occurred_at desc)
      from (select * from adoption_candidates where effective_pipeline_id is not null order by occurred_at desc limit 20) q
    ), '[]'::jsonb),
    'caveat', 'A fila não cria resultados automaticamente. Atividades históricas só entram no aprendizado após instrumentação explícita e permanecem marcadas como contexto reconstruído.'
  ) into result;
  return result;
end;
$$;

comment on function public.knowledge_outcome_operations(uuid, integer)
is 'Returns the operational queue for capturing real outcomes, overdue tasks, stale pipelines and explicit historical activity instrumentation.';

create or replace function public.knowledge_adopt_existing_activity(
  p_activity_id uuid,
  p_idempotency_key text,
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
  pipeline_row public.pipeline%rowtype;
  node_row public.knowledge_nodes%rowtype;
  existing_reference public.knowledge_references%rowtype;
  node_payload jsonb;
  context_snapshot jsonb;
  tracking_task_id uuid;
  generated_node_type text;
  generated_title text;
  generated_content text;
  owner_label text;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 8 or length(p_idempotency_key) > 160 then
    raise exception 'Invalid idempotency key';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('knowledge:outcome:adopt:' || p_activity_id::text, 0));

  select * into activity_row from public.activities where id = p_activity_id for update;
  if not found or activity_row.company_id is null then
    raise exception 'Activity not found, inaccessible or not linked to a company: %', p_activity_id;
  end if;
  if coalesce(activity_row.metadata->>'status', 'open') = 'done' or nullif(activity_row.metadata->>'outcomeStatus', '') is not null then
    raise exception 'Completed activities cannot be adopted as pending outcomes: %', p_activity_id;
  end if;

  select * into existing_reference from public.knowledge_references
  where reference_type = 'activity' and reference_id = activity_row.id limit 1;
  if found then
    return jsonb_build_object(
      'status', 'already_instrumented', 'activityId', activity_row.id,
      'companyId', activity_row.company_id, 'nodeId', existing_reference.node_id,
      'contextMode', coalesce(activity_row.metadata->'outcomeContext'->>'contextMode', 'unknown')
    );
  end if;

  select p.* into pipeline_row
  from public.pipeline p
  where p.id = activity_row.pipeline_id or (activity_row.pipeline_id is null and p.company_id = activity_row.company_id)
  order by case when p.id = activity_row.pipeline_id then 0 else 1 end
  limit 1 for update;
  if not found then
    raise exception 'Company must have an active pipeline record before activity instrumentation: %', activity_row.company_id;
  end if;

  if p_node_id is not null then
    select * into node_row from public.knowledge_nodes
    where id = p_node_id and company_id = activity_row.company_id and status = 'active';
    if not found then raise exception 'Knowledge node not found, inaccessible or linked to another company: %', p_node_id; end if;
  else
    generated_node_type := case
      when activity_row.activity_type in ('meeting', 'call', 'email', 'follow_up') then 'meeting'
      when activity_row.activity_type in ('research', 'document') then 'source'
      else 'note'
    end;
    generated_title := 'Atividade histórica — ' || activity_row.title;
    generated_content := format(
      E'# Atividade histórica\n\n> Contexto reconstruído em %s para instrumentação de resultado. Este registro não representa um snapshot capturado na data original.\n\n## Atividade\n- Tipo: %s\n- Data original: %s\n- Responsável: %s\n\n## Registro original\n%s\n\n## Resultado\nPendente de confirmação pelo time.\n',
      to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'), activity_row.activity_type,
      to_char(activity_row.occurred_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
      coalesce(activity_row.owner_name, 'não informado'), coalesce(nullif(activity_row.description, ''), activity_row.title)
    );
    node_payload := public.knowledge_save_node(
      null, generated_title, generated_node_type, generated_content,
      array['outcome-operations', 'atividade-historica', 'contexto-reconstruido'],
      jsonb_build_object('source', 'legacy_activity_adoption', 'activityId', activity_row.id,
        'contextMode', 'reconstructed_at_adoption', 'originalOccurredAt', activity_row.occurred_at),
      activity_row.company_id, 'team'
    );
    select * into node_row from public.knowledge_nodes where id = (node_payload->'node'->>'id')::uuid;
  end if;

  context_snapshot := public.knowledge_build_execution_context(activity_row.company_id, node_row.id);
  context_snapshot := jsonb_set(context_snapshot, '{contextMode}', to_jsonb('reconstructed_at_adoption'::text), true);
  context_snapshot := context_snapshot || jsonb_build_object(
    'adoption', jsonb_build_object(
      'adoptedAt', now(), 'adoptedBy', current_user_id, 'originalOccurredAt', activity_row.occurred_at,
      'originalOrigin', nullif(activity_row.metadata->>'origin', ''),
      'caveat', 'Historical context reconstructed at adoption. Do not interpret as captured at the original action time.'
    ),
    'actionRequest', jsonb_build_object(
      'fromStage', null, 'requestedStage', null, 'effectiveStage', pipeline_row.stage,
      'requestedNextAction', null, 'effectiveNextAction', pipeline_row.next_action, 'dueAt', null
    )
  );

  update public.activities set
    pipeline_id = pipeline_row.id,
    metadata = metadata || jsonb_build_object(
      'status', coalesce(metadata->>'status', 'open'), 'knowledgeNodeId', node_row.id,
      'outcomeInstrumentationOrigin', 'knowledge_vault_v7', 'outcomeContext', context_snapshot,
      'instrumentedAt', now(), 'instrumentedBy', current_user_id,
      'instrumentationIdempotencyKey', btrim(p_idempotency_key)
    ), updated_at = now()
  where id = activity_row.id;

  insert into public.knowledge_references (node_id, company_id, reference_type, reference_id, label, snapshot, created_by)
  values (
    node_row.id, activity_row.company_id, 'activity', activity_row.id, activity_row.title,
    jsonb_build_object('activityType', activity_row.activity_type, 'title', activity_row.title,
      'status', 'open', 'occurredAt', activity_row.occurred_at,
      'contextMode', 'reconstructed_at_adoption', 'instrumentedAt', now()),
    current_user_id
  );

  insert into public.knowledge_references (node_id, company_id, reference_type, reference_id, label, snapshot, created_by)
  values (
    node_row.id, activity_row.company_id, 'pipeline', pipeline_row.id, format('Pipeline — %s', pipeline_row.stage),
    jsonb_build_object('stage', pipeline_row.stage, 'status', pipeline_row.status, 'priority', pipeline_row.priority,
      'nextAction', pipeline_row.next_action, 'nextActionDueAt', pipeline_row.next_action_due_at, 'instrumentedAt', now()),
    current_user_id
  ) on conflict (node_id, reference_type, reference_id) do nothing;

  owner_label := coalesce(nullif(activity_row.owner_name, ''), nullif(auth.jwt()->>'email', ''), current_user_id::text);
  insert into public.tasks (company_id, pipeline_id, title, description, status, priority, due_at, owner_name, metadata)
  values (
    activity_row.company_id, pipeline_row.id, 'Registrar resultado — ' || activity_row.title,
    'Pendência criada pela Outcome Operations V7 para confirmar o resultado de uma atividade histórica instrumentada explicitamente.',
    'todo', case when pipeline_row.priority in ('high', 'hot', 'A', 'priority_1') then 'high' else 'medium' end,
    now(), owner_label,
    jsonb_build_object('origin', 'knowledge_vault', 'knowledgeNodeId', node_row.id,
      'knowledgeActivityId', activity_row.id, 'adoptedLegacyActivity', true,
      'createdBy', current_user_id, 'instrumentationIdempotencyKey', btrim(p_idempotency_key))
  ) returning id into tracking_task_id;

  insert into public.knowledge_references (node_id, company_id, reference_type, reference_id, label, snapshot, created_by)
  values (
    node_row.id, activity_row.company_id, 'task', tracking_task_id, 'Registrar resultado — ' || activity_row.title,
    jsonb_build_object('title', 'Registrar resultado — ' || activity_row.title, 'status', 'todo',
      'dueAt', now(), 'activityId', activity_row.id, 'contextMode', 'reconstructed_at_adoption', 'createdAt', now()),
    current_user_id
  );

  return jsonb_build_object(
    'status', 'instrumented', 'activityId', activity_row.id, 'companyId', activity_row.company_id,
    'pipelineId', pipeline_row.id, 'nodeId', node_row.id, 'nodeTitle', node_row.title,
    'taskId', tracking_task_id, 'contextMode', 'reconstructed_at_adoption'
  );
end;
$$;

comment on function public.knowledge_adopt_existing_activity(uuid, text, uuid)
is 'Explicitly instruments a historical company activity for outcome capture. Creates an auditable reconstructed note and tracking task when no node is supplied.';

revoke all on function public.knowledge_outcome_operations(uuid, integer) from public, anon;
revoke all on function public.knowledge_adopt_existing_activity(uuid, text, uuid) from public, anon;
grant execute on function public.knowledge_outcome_operations(uuid, integer) to authenticated, service_role;
grant execute on function public.knowledge_adopt_existing_activity(uuid, text, uuid) to authenticated, service_role;
grant select on public.knowledge_execution_outcomes_v1 to authenticated, service_role;
