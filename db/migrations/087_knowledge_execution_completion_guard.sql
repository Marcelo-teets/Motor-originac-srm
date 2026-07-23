-- Prevent a completed knowledge execution from being concluded again with a new key.
-- A repeated request returns the current workspace without changing outcome or creating tasks.

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

  if activity_row.metadata->>'completionIdempotencyKey' = btrim(p_idempotency_key)
     or coalesce(activity_row.metadata->>'status', 'open') = 'done' then
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
