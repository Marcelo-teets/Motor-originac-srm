-- V9 hardening: preserve the personal owner display name in task metadata.
-- This avoids broadening user_profiles RLS just to render another user's assignment.

create or replace function public.knowledge_outcome_sla_workspace(
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
  base_payload jsonb;
  enriched_pending jsonb;
  enriched_adoption jsonb;
  assignment_summary jsonb;
  my_queue jsonb;
  unclaimed_queue jsonb;
  breached_queue jsonb;
  due_soon_queue jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  base_payload := public.knowledge_outcome_operations(p_company_id, p_days);

  with source_items as (
    select 'pending'::text as queue_source, value as item
    from jsonb_array_elements(coalesce(base_payload->'pendingOutcomes', '[]'::jsonb))
    union all
    select 'adoption'::text as queue_source, value as item
    from jsonb_array_elements(coalesce(base_payload->'adoptionCandidates', '[]'::jsonb))
  ), enriched as (
    select
      s.queue_source,
      s.item || jsonb_build_object(
        'queueSource', s.queue_source,
        'taskOwnerUserId', t.owner_user_id,
        'taskOwnerDisplayName', case
          when t.owner_user_id is null then null
          else coalesce(
            nullif(t.metadata->>'outcomeOwnerDisplayName', ''),
            case when t.owner_user_id = current_user_id then nullif(t.owner_name, '') end,
            'Usuário atribuído'
          )
        end,
        'claimedAt', t.claimed_at,
        'slaDueAt', t.sla_due_at,
        'isMine', t.owner_user_id = current_user_id,
        'assignmentStatus', case
          when t.owner_user_id is null then 'unclaimed'
          when t.owner_user_id = current_user_id then 'mine'
          else 'assigned'
        end,
        'slaStatus', case
          when t.owner_user_id is null then 'unclaimed'
          when t.sla_due_at is null then 'without_sla'
          when t.sla_due_at < now() then 'breached'
          when t.sla_due_at <= now() + interval '24 hours' then 'due_soon'
          else 'on_track'
        end,
        'slaHoursRemaining', case
          when t.sla_due_at is null then null
          else round((extract(epoch from (t.sla_due_at - now())) / 3600.0)::numeric, 1)
        end
      ) as enriched_item,
      t.owner_user_id,
      t.sla_due_at,
      coalesce(nullif(s.item->>'priorityScore', '')::integer, 0) as priority_score
    from source_items s
    left join lateral (
      select task.*
      from public.tasks task
      where task.metadata->>'knowledgeActivityId' = s.item->>'activityId'
        and task.status not in ('done', 'completed', 'cancelled')
      order by
        case when task.metadata->>'adoptedLegacyActivity' = 'true' then 0 else 1 end,
        task.created_at desc,
        task.id desc
      limit 1
    ) t on true
  )
  select
    coalesce(jsonb_agg(enriched_item order by sla_due_at nulls first, priority_score desc)
      filter (where queue_source = 'pending'), '[]'::jsonb),
    coalesce(jsonb_agg(enriched_item order by priority_score desc)
      filter (where queue_source = 'adoption'), '[]'::jsonb),
    jsonb_build_object(
      'assignedItems', count(*) filter (where owner_user_id is not null),
      'unassignedItems', count(*) filter (where owner_user_id is null),
      'myItems', count(*) filter (where owner_user_id = current_user_id),
      'breachedItems', count(*) filter (where owner_user_id is not null and sla_due_at < now()),
      'dueSoonItems', count(*) filter (
        where owner_user_id is not null
          and sla_due_at >= now()
          and sla_due_at <= now() + interval '24 hours'
      )
    ),
    coalesce(jsonb_agg(enriched_item order by sla_due_at nulls first, priority_score desc)
      filter (where owner_user_id = current_user_id), '[]'::jsonb),
    coalesce(jsonb_agg(enriched_item order by priority_score desc)
      filter (where owner_user_id is null), '[]'::jsonb),
    coalesce(jsonb_agg(enriched_item order by sla_due_at, priority_score desc)
      filter (where owner_user_id is not null and sla_due_at < now()), '[]'::jsonb),
    coalesce(jsonb_agg(enriched_item order by sla_due_at, priority_score desc)
      filter (
        where owner_user_id is not null
          and sla_due_at >= now()
          and sla_due_at <= now() + interval '24 hours'
      ), '[]'::jsonb)
  into enriched_pending, enriched_adoption, assignment_summary,
       my_queue, unclaimed_queue, breached_queue, due_soon_queue
  from enriched;

  return base_payload || jsonb_build_object(
    'summary', coalesce(base_payload->'summary', '{}'::jsonb) || assignment_summary,
    'pendingOutcomes', enriched_pending,
    'adoptionCandidates', enriched_adoption,
    'myQueue', my_queue,
    'unclaimedQueue', unclaimed_queue,
    'breachedQueue', breached_queue,
    'dueSoonQueue', due_soon_queue,
    'currentUserId', current_user_id,
    'slaPolicy', jsonb_build_object(
      'immediateHours', 24,
      'highHours', 48,
      'reviewHours', 120,
      'lowHours', 168,
      'basis', 'operational_priority_band'
    )
  );
end;
$$;

create or replace function public.knowledge_claim_outcome_work_item(
  p_activity_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_profile public.user_profiles%rowtype;
  activity_row public.activities%rowtype;
  task_row public.tasks%rowtype;
  adoption_result jsonb;
  operations_payload jsonb;
  priority_item jsonb;
  priority_band text;
  sla_hours integer;
  owner_display_name text;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 8 or length(p_idempotency_key) > 180 then
    raise exception 'Invalid idempotency key';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('knowledge:outcome:claim:' || p_activity_id::text, 0));

  select * into current_profile
  from public.user_profiles
  where id = current_user_id and status = 'active';
  if not found then raise exception 'Active user profile required'; end if;
  owner_display_name := coalesce(nullif(current_profile.full_name, ''), current_profile.email, current_user_id::text);

  select * into activity_row
  from public.activities
  where id = p_activity_id
  for update;
  if not found or activity_row.company_id is null then
    raise exception 'Activity not found, inaccessible or not linked to a company: %', p_activity_id;
  end if;
  if coalesce(activity_row.metadata->>'status', 'open') = 'done'
     or nullif(activity_row.metadata->>'outcomeStatus', '') is not null then
    raise exception 'Completed activities cannot be claimed: %', p_activity_id;
  end if;

  operations_payload := public.knowledge_outcome_operations(activity_row.company_id, 3650);
  select candidate.item into priority_item
  from (
    select value as item from jsonb_array_elements(coalesce(operations_payload->'pendingOutcomes', '[]'::jsonb))
    union all
    select value as item from jsonb_array_elements(coalesce(operations_payload->'adoptionCandidates', '[]'::jsonb))
  ) candidate
  where candidate.item->>'activityId' = p_activity_id::text
  limit 1;

  priority_band := coalesce(priority_item->>'priorityBand', 'review');
  sla_hours := case priority_band
    when 'immediate' then 24
    when 'high' then 48
    when 'review' then 120
    else 168
  end;

  select * into task_row
  from public.tasks task
  where task.metadata->>'knowledgeActivityId' = p_activity_id::text
    and task.status not in ('done', 'completed', 'cancelled')
  order by task.created_at desc, task.id desc
  limit 1
  for update;

  if not found then
    adoption_result := public.knowledge_adopt_existing_activity(
      p_activity_id,
      'claim-adoption:' || btrim(p_idempotency_key),
      null
    );

    select * into task_row
    from public.tasks task
    where task.metadata->>'knowledgeActivityId' = p_activity_id::text
      and task.status not in ('done', 'completed', 'cancelled')
    order by task.created_at desc, task.id desc
    limit 1
    for update;
  end if;

  if not found then
    raise exception 'Outcome tracking task could not be resolved for activity: %', p_activity_id;
  end if;

  if task_row.owner_user_id is not null and task_row.owner_user_id <> current_user_id then
    raise exception 'Outcome item is already owned by another active user';
  end if;

  if task_row.owner_user_id = current_user_id then
    if nullif(task_row.metadata->>'outcomeOwnerDisplayName', '') is null then
      update public.tasks
      set metadata = metadata || jsonb_build_object('outcomeOwnerDisplayName', owner_display_name),
          updated_at = now()
      where id = task_row.id
      returning * into task_row;
    end if;

    return jsonb_build_object(
      'status', 'already_claimed',
      'activityId', p_activity_id,
      'taskId', task_row.id,
      'ownerUserId', current_user_id,
      'ownerDisplayName', owner_display_name,
      'claimedAt', task_row.claimed_at,
      'slaDueAt', task_row.sla_due_at,
      'priorityBand', priority_band
    );
  end if;

  update public.tasks
  set owner_user_id = current_user_id,
      claimed_at = now(),
      sla_due_at = now() + make_interval(hours => sla_hours),
      metadata = metadata || jsonb_build_object(
        'outcomeOwnershipVersion', 9,
        'outcomeClaimIdempotencyKey', btrim(p_idempotency_key),
        'outcomeClaimedBy', current_user_id,
        'outcomeOwnerDisplayName', owner_display_name,
        'outcomeClaimedAt', now(),
        'outcomeSlaBasis', priority_band,
        'outcomeSlaHours', sla_hours
      ),
      updated_at = now()
  where id = task_row.id
  returning * into task_row;

  return jsonb_build_object(
    'status', 'claimed',
    'activityId', p_activity_id,
    'taskId', task_row.id,
    'ownerUserId', current_user_id,
    'ownerDisplayName', owner_display_name,
    'claimedAt', task_row.claimed_at,
    'slaDueAt', task_row.sla_due_at,
    'priorityBand', priority_band,
    'instrumentationStatus', adoption_result->>'status'
  );
end;
$$;

comment on function public.knowledge_outcome_sla_workspace(uuid, integer) is
  'Returns Outcome Workbench ownership and SLA without requiring cross-user profile visibility. Owner names are snapshotted at explicit claim time.';
comment on function public.knowledge_claim_outcome_work_item(uuid, text) is
  'Explicitly claims an outcome item and snapshots the display name in task metadata without widening user_profiles RLS.';
