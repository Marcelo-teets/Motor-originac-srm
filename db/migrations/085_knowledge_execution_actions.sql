-- Knowledge Vault V5: connect governed knowledge to the existing CRM execution layer.
-- Reuses activities, tasks and pipeline. No parallel CRM tables are introduced.

alter table public.knowledge_references
  drop constraint if exists knowledge_references_reference_type_check;

alter table public.knowledge_references
  add constraint knowledge_references_reference_type_check
  check (reference_type in (
    'company_signal',
    'monitoring_output',
    'qualification_snapshot',
    'pipeline',
    'activity',
    'task'
  ));

create unique index if not exists idx_activities_knowledge_idempotency
  on public.activities ((metadata->>'knowledgeIdempotencyKey'))
  where metadata ? 'knowledgeIdempotencyKey';

create unique index if not exists idx_tasks_knowledge_completion_idempotency
  on public.tasks ((metadata->>'knowledgeCompletionIdempotencyKey'))
  where metadata ? 'knowledgeCompletionIdempotencyKey';

create index if not exists idx_knowledge_references_reference_lookup
  on public.knowledge_references (reference_type, reference_id, created_at desc);

create index if not exists idx_activities_company_occurred
  on public.activities (company_id, occurred_at desc);

create index if not exists idx_tasks_company_status_due
  on public.tasks (company_id, status, due_at);

create or replace function public.knowledge_company_execution_workspace(p_company_id uuid)
returns jsonb
language sql
security invoker
stable
set search_path = public
as $$
  select jsonb_build_object(
    'companyId', c.id,
    'pipeline', (
      select jsonb_build_object(
        'id', p.id,
        'stage', p.stage,
        'status', p.status,
        'priority', p.priority,
        'owner', p.owner_name,
        'nextAction', p.next_action,
        'nextActionDueAt', p.next_action_due_at,
        'expectedStructure', p.expected_structure,
        'expectedTicket', p.expected_ticket,
        'updatedAt', p.updated_at
      )
      from public.pipeline p
      where p.company_id = c.id
      limit 1
    ),
    'executions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'activityId', execution.activity_id,
        'nodeId', execution.node_id,
        'nodeTitle', execution.node_title,
        'activityType', execution.activity_type,
        'title', execution.title,
        'description', execution.description,
        'owner', execution.owner_name,
        'occurredAt', execution.occurred_at,
        'status', coalesce(execution.metadata->>'status', 'open'),
        'outcomeStatus', execution.metadata->>'outcomeStatus',
        'outcome', execution.metadata->>'outcome',
        'fromStage', execution.metadata->>'fromStage',
        'toStage', execution.metadata->>'toStage',
        'requestedStage', execution.metadata->>'requestedStage',
        'requestedNextAction', execution.metadata->>'requestedNextAction',
        'actualNextAction', execution.metadata->>'actualNextAction',
        'completedAt', execution.metadata->>'completedAt',
        'taskId', execution.task_id,
        'taskTitle', execution.task_title,
        'taskStatus', execution.task_status,
        'dueAt', execution.task_due_at
      ) order by execution.occurred_at desc)
      from (
        select
          a.id as activity_id,
          a.activity_type,
          a.title,
          a.description,
          a.owner_name,
          a.occurred_at,
          a.metadata,
          r.node_id,
          n.title as node_title,
          linked_task.id as task_id,
          linked_task.title as task_title,
          linked_task.status as task_status,
          linked_task.due_at as task_due_at
        from public.activities a
        join public.knowledge_references r
          on r.reference_type = 'activity'
         and r.reference_id = a.id
        join public.knowledge_nodes n
          on n.id = r.node_id
         and n.status = 'active'
        left join lateral (
          select t.id, t.title, t.status, t.due_at
          from public.tasks t
          where t.metadata->>'knowledgeActivityId' = a.id::text
          order by t.created_at asc
          limit 1
        ) linked_task on true
        where a.company_id = c.id
        order by a.occurred_at desc
        limit 20
      ) execution
    ), '[]'::jsonb),
    'openTaskCount', (
      select count(*)
      from public.tasks t
      where t.company_id = c.id
        and t.status not in ('done', 'cancelled')
        and t.metadata->>'origin' = 'knowledge_vault'
    )
  )
  from public.companies c
  where c.id = p_company_id;
$$;

create or replace function public.knowledge_create_execution_action(
  p_node_id uuid,
  p_idempotency_key text,
  p_activity_type text,
  p_title text,
  p_description text default null,
  p_next_action text default null,
  p_due_at timestamptz default null,
  p_target_stage text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  node_row public.knowledge_nodes%rowtype;
  pipeline_row public.pipeline%rowtype;
  activity_id uuid;
  task_id uuid;
  existing_company_id uuid;
  owner_label text;
  before_stage text;
  before_next_action text;
  normalized_next_action text := nullif(btrim(coalesce(p_next_action, '')), '');
  normalized_description text := nullif(btrim(coalesce(p_description, '')), '');
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 8 or length(p_idempotency_key) > 160 then
    raise exception 'Invalid idempotency key';
  end if;
  if p_activity_type not in ('follow_up', 'meeting', 'email', 'call', 'research', 'committee', 'other') then
    raise exception 'Invalid activity type: %', p_activity_type;
  end if;
  if p_title is null or length(btrim(p_title)) = 0 then raise exception 'Activity title is required'; end if;
  if p_target_stage is not null and p_target_stage not in (
    'Identified', 'Qualified', 'Approach', 'Structuring', 'Mandated', 'ClosedWon', 'ClosedLost', 'Recycled'
  ) then
    raise exception 'Invalid pipeline stage: %', p_target_stage;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('knowledge:execution:create:' || btrim(p_idempotency_key), 0));

  select a.company_id into existing_company_id
  from public.activities a
  where a.metadata->>'knowledgeIdempotencyKey' = btrim(p_idempotency_key)
  limit 1;

  if existing_company_id is not null then
    return public.knowledge_company_execution_workspace(existing_company_id);
  end if;

  select * into node_row
  from public.knowledge_nodes
  where id = p_node_id
    and status = 'active';

  if not found then raise exception 'Knowledge node not found or not accessible: %', p_node_id; end if;
  if node_row.company_id is null then raise exception 'Knowledge node must be linked to a company'; end if;

  owner_label := coalesce(nullif(auth.jwt()->>'email', ''), current_user_id::text);

  insert into public.pipeline (
    company_id, stage, status, owner_name, priority, next_action, next_action_due_at, notes
  ) values (
    node_row.company_id,
    coalesce(p_target_stage, 'Identified'),
    'active',
    owner_label,
    'watchlist',
    normalized_next_action,
    p_due_at,
    '[knowledge_execution_v1]'
  )
  on conflict (company_id) do nothing;

  select * into pipeline_row
  from public.pipeline
  where company_id = node_row.company_id
  for update;

  before_stage := pipeline_row.stage;
  before_next_action := pipeline_row.next_action;

  if p_target_stage is not null or normalized_next_action is not null or p_due_at is not null then
    update public.pipeline
    set
      stage = coalesce(p_target_stage, stage),
      next_action = coalesce(normalized_next_action, next_action),
      next_action_due_at = coalesce(p_due_at, next_action_due_at),
      last_contact_at = case
        when p_activity_type in ('meeting', 'email', 'call') then now()
        else last_contact_at
      end
    where id = pipeline_row.id
    returning * into pipeline_row;
  end if;

  insert into public.activities (
    company_id,
    pipeline_id,
    activity_type,
    title,
    description,
    occurred_at,
    owner_name,
    metadata
  ) values (
    node_row.company_id,
    pipeline_row.id,
    p_activity_type,
    btrim(p_title),
    normalized_description,
    now(),
    owner_label,
    jsonb_build_object(
      'origin', 'knowledge_vault',
      'knowledgeNodeId', node_row.id,
      'knowledgeIdempotencyKey', btrim(p_idempotency_key),
      'status', 'open',
      'createdBy', current_user_id,
      'fromStage', before_stage,
      'requestedStage', p_target_stage,
      'toStage', pipeline_row.stage,
      'beforeNextAction', before_next_action,
      'requestedNextAction', normalized_next_action,
      'actualNextAction', pipeline_row.next_action,
      'dueAt', p_due_at
    )
  ) returning id into activity_id;

  if normalized_next_action is not null then
    insert into public.tasks (
      company_id,
      pipeline_id,
      title,
      description,
      status,
      priority,
      due_at,
      owner_name,
      metadata
    ) values (
      node_row.company_id,
      pipeline_row.id,
      normalized_next_action,
      format('Ação originada da nota "%s".', node_row.title),
      'todo',
      case when pipeline_row.priority in ('high', 'hot', 'A', 'priority_1') then 'high' else 'medium' end,
      p_due_at,
      owner_label,
      jsonb_build_object(
        'origin', 'knowledge_vault',
        'knowledgeNodeId', node_row.id,
        'knowledgeActivityId', activity_id,
        'createdBy', current_user_id
      )
    ) returning id into task_id;
  end if;

  insert into public.knowledge_references (
    node_id, company_id, reference_type, reference_id, label, snapshot, created_by
  ) values (
    node_row.id,
    node_row.company_id,
    'activity',
    activity_id,
    btrim(p_title),
    jsonb_build_object(
      'activityType', p_activity_type,
      'title', btrim(p_title),
      'description', normalized_description,
      'owner', owner_label,
      'fromStage', before_stage,
      'requestedStage', p_target_stage,
      'actualStage', pipeline_row.stage,
      'requestedNextAction', normalized_next_action,
      'actualNextAction', pipeline_row.next_action,
      'dueAt', p_due_at,
      'createdAt', now()
    ),
    current_user_id
  );

  if task_id is not null then
    insert into public.knowledge_references (
      node_id, company_id, reference_type, reference_id, label, snapshot, created_by
    ) values (
      node_row.id,
      node_row.company_id,
      'task',
      task_id,
      normalized_next_action,
      jsonb_build_object(
        'title', normalized_next_action,
        'status', 'todo',
        'dueAt', p_due_at,
        'activityId', activity_id,
        'createdAt', now()
      ),
      current_user_id
    );
  end if;

  insert into public.knowledge_references (
    node_id, company_id, reference_type, reference_id, label, snapshot, created_by
  ) values (
    node_row.id,
    node_row.company_id,
    'pipeline',
    pipeline_row.id,
    format('Pipeline — %s', pipeline_row.stage),
    jsonb_build_object(
      'stage', pipeline_row.stage,
      'status', pipeline_row.status,
      'priority', pipeline_row.priority,
      'nextAction', pipeline_row.next_action,
      'nextActionDueAt', pipeline_row.next_action_due_at,
      'updatedAt', pipeline_row.updated_at
    ),
    current_user_id
  )
  on conflict (node_id, reference_type, reference_id) do update
  set
    label = excluded.label,
    snapshot = excluded.snapshot,
    created_by = excluded.created_by,
    created_at = now();

  return public.knowledge_company_execution_workspace(node_row.company_id);
end;
$$;

create or replace function public.knowledge_complete_execution_action(
  p_activity_id uuid,
  p_idempotency_key text,
  p_outcome_status text,
  p_outcome text,
  p_next_action text default null,
  p_due_at timestamptz default null,
  p_target_stage text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  activity_row public.activities%rowtype;
  node_row public.knowledge_nodes%rowtype;
  pipeline_row public.pipeline%rowtype;
  follow_up_task_id uuid;
  owner_label text;
  before_stage text;
  before_next_action text;
  normalized_next_action text := nullif(btrim(coalesce(p_next_action, '')), '');
  normalized_outcome text := nullif(btrim(coalesce(p_outcome, '')), '');
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 8 or length(p_idempotency_key) > 160 then
    raise exception 'Invalid idempotency key';
  end if;
  if p_outcome_status not in ('progress', 'won', 'lost', 'blocked', 'no_change') then
    raise exception 'Invalid outcome status: %', p_outcome_status;
  end if;
  if normalized_outcome is null then raise exception 'Outcome is required'; end if;
  if p_target_stage is not null and p_target_stage not in (
    'Identified', 'Qualified', 'Approach', 'Structuring', 'Mandated', 'ClosedWon', 'ClosedLost', 'Recycled'
  ) then
    raise exception 'Invalid pipeline stage: %', p_target_stage;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('knowledge:execution:complete:' || p_activity_id::text, 0));

  select a.* into activity_row
  from public.activities a
  join public.knowledge_references r
    on r.reference_type = 'activity'
   and r.reference_id = a.id
  join public.knowledge_nodes n
    on n.id = r.node_id
   and n.status = 'active'
  where a.id = p_activity_id
  limit 1;

  if not found then raise exception 'Execution activity not found or not accessible: %', p_activity_id; end if;

  if activity_row.metadata->>'completionIdempotencyKey' = btrim(p_idempotency_key) then
    return public.knowledge_company_execution_workspace(activity_row.company_id);
  end if;

  select n.* into node_row
  from public.knowledge_nodes n
  join public.knowledge_references r
    on r.node_id = n.id
   and r.reference_type = 'activity'
   and r.reference_id = activity_row.id
  where n.status = 'active'
  limit 1;

  owner_label := coalesce(nullif(auth.jwt()->>'email', ''), current_user_id::text);

  select * into pipeline_row
  from public.pipeline
  where id = activity_row.pipeline_id
  for update;

  before_stage := pipeline_row.stage;
  before_next_action := pipeline_row.next_action;

  if p_target_stage is not null or normalized_next_action is not null or p_due_at is not null then
    update public.pipeline
    set
      stage = coalesce(p_target_stage, stage),
      next_action = coalesce(normalized_next_action, next_action),
      next_action_due_at = case
        when normalized_next_action is not null then p_due_at
        else coalesce(p_due_at, next_action_due_at)
      end
    where id = pipeline_row.id
    returning * into pipeline_row;
  end if;

  update public.activities
  set
    metadata = metadata || jsonb_build_object(
      'status', 'done',
      'outcomeStatus', p_outcome_status,
      'outcome', normalized_outcome,
      'completedAt', now(),
      'completedBy', current_user_id,
      'completionIdempotencyKey', btrim(p_idempotency_key),
      'resultFromStage', before_stage,
      'resultRequestedStage', p_target_stage,
      'resultToStage', pipeline_row.stage,
      'resultBeforeNextAction', before_next_action,
      'resultRequestedNextAction', normalized_next_action,
      'resultActualNextAction', pipeline_row.next_action
    ),
    updated_at = now()
  where id = activity_row.id;

  update public.tasks
  set
    status = 'done',
    completed_at = coalesce(completed_at, now()),
    updated_at = now(),
    metadata = metadata || jsonb_build_object(
      'completedFromKnowledge', true,
      'completedBy', current_user_id,
      'outcomeStatus', p_outcome_status
    )
  where metadata->>'knowledgeActivityId' = activity_row.id::text
    and status not in ('done', 'cancelled');

  if normalized_next_action is not null then
    insert into public.tasks (
      company_id,
      pipeline_id,
      title,
      description,
      status,
      priority,
      due_at,
      owner_name,
      metadata
    ) values (
      activity_row.company_id,
      pipeline_row.id,
      normalized_next_action,
      format('Próxima ação após o resultado de "%s".', activity_row.title),
      'todo',
      case when pipeline_row.priority in ('high', 'hot', 'A', 'priority_1') then 'high' else 'medium' end,
      p_due_at,
      owner_label,
      jsonb_build_object(
        'origin', 'knowledge_vault',
        'knowledgeNodeId', node_row.id,
        'parentKnowledgeActivityId', activity_row.id,
        'knowledgeCompletionIdempotencyKey', btrim(p_idempotency_key),
        'createdBy', current_user_id
      )
    )
    on conflict do nothing
    returning id into follow_up_task_id;

    if follow_up_task_id is not null then
      insert into public.knowledge_references (
        node_id, company_id, reference_type, reference_id, label, snapshot, created_by
      ) values (
        node_row.id,
        activity_row.company_id,
        'task',
        follow_up_task_id,
        normalized_next_action,
        jsonb_build_object(
          'title', normalized_next_action,
          'status', 'todo',
          'dueAt', p_due_at,
          'parentActivityId', activity_row.id,
          'outcomeStatus', p_outcome_status,
          'createdAt', now()
        ),
        current_user_id
      );
    end if;
  end if;

  update public.knowledge_references
  set snapshot = snapshot || jsonb_build_object(
    'status', 'done',
    'outcomeStatus', p_outcome_status,
    'outcome', normalized_outcome,
    'completedAt', now(),
    'resultFromStage', before_stage,
    'resultRequestedStage', p_target_stage,
    'resultActualStage', pipeline_row.stage,
    'resultRequestedNextAction', normalized_next_action,
    'resultActualNextAction', pipeline_row.next_action
  )
  where node_id = node_row.id
    and reference_type = 'activity'
    and reference_id = activity_row.id;

  update public.knowledge_references
  set
    label = format('Pipeline — %s', pipeline_row.stage),
    snapshot = jsonb_build_object(
      'stage', pipeline_row.stage,
      'status', pipeline_row.status,
      'priority', pipeline_row.priority,
      'nextAction', pipeline_row.next_action,
      'nextActionDueAt', pipeline_row.next_action_due_at,
      'updatedAt', pipeline_row.updated_at
    ),
    created_by = current_user_id,
    created_at = now()
  where node_id = node_row.id
    and reference_type = 'pipeline'
    and reference_id = pipeline_row.id;

  return public.knowledge_company_execution_workspace(activity_row.company_id);
end;
$$;

comment on function public.knowledge_company_execution_workspace(uuid)
is 'Returns pipeline state and knowledge-linked execution actions for a company.';

comment on function public.knowledge_create_execution_action(uuid, text, text, text, text, text, timestamptz, text)
is 'Creates an auditable CRM activity/task from an accessible knowledge node and applies the requested pipeline state through existing guards.';

comment on function public.knowledge_complete_execution_action(uuid, text, text, text, text, timestamptz, text)
is 'Records the commercial outcome of a knowledge-linked activity, completes its task and creates an optional follow-up.';

grant execute on function public.knowledge_company_execution_workspace(uuid) to authenticated, service_role;
grant execute on function public.knowledge_create_execution_action(uuid, text, text, text, text, text, timestamptz, text) to authenticated, service_role;
grant execute on function public.knowledge_complete_execution_action(uuid, text, text, text, text, timestamptz, text) to authenticated, service_role;

revoke all on function public.knowledge_company_execution_workspace(uuid) from public, anon;
revoke all on function public.knowledge_create_execution_action(uuid, text, text, text, text, text, timestamptz, text) from public, anon;
revoke all on function public.knowledge_complete_execution_action(uuid, text, text, text, text, timestamptz, text) from public, anon;
