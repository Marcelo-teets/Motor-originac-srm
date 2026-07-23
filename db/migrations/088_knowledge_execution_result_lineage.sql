-- Expose requested versus effective pipeline changes produced when an execution is completed.

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
        'resultFromStage', execution.metadata->>'resultFromStage',
        'resultToStage', execution.metadata->>'resultToStage',
        'resultRequestedStage', execution.metadata->>'resultRequestedStage',
        'resultRequestedNextAction', execution.metadata->>'resultRequestedNextAction',
        'resultActualNextAction', execution.metadata->>'resultActualNextAction',
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
             or t.metadata->>'parentKnowledgeActivityId' = a.id::text
          order by t.created_at desc
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
