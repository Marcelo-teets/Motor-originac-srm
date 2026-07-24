-- Knowledge Vault V9: ownership and SLA control for Outcome Workbench.
-- Extends the official tasks table; does not create a parallel CRM or automatic outcomes.

alter table public.tasks
  add column if not exists owner_user_id uuid references public.user_profiles(id) on delete set null,
  add column if not exists claimed_at timestamptz,
  add column if not exists sla_due_at timestamptz;

create index if not exists tasks_owner_user_status_idx
  on public.tasks (owner_user_id, status, sla_due_at)
  where owner_user_id is not null;

create index if not exists tasks_outcome_activity_open_idx
  on public.tasks ((metadata->>'knowledgeActivityId'), status, sla_due_at)
  where metadata ? 'knowledgeActivityId';

comment on column public.tasks.owner_user_id is
  'Authenticated user who explicitly owns this operational task. owner_name remains the functional/team label.';
comment on column public.tasks.claimed_at is
  'Timestamp when an authenticated user explicitly claimed the task.';
comment on column public.tasks.sla_due_at is
  'Operational SLA for handling the task. Separate from the commercial due_at field.';

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
        'taskOwnerDisplayName', coalesce(up.full_name, up.email, t.owner_name),
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
    left join public.user_profiles up on up.id = t.owner_user_id
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

comment on function public.knowledge_outcome_sla_workspace(uuid, integer) is
  'Returns Outcome Workbench data enriched with explicit ownership, SLA state and personal queues. Does not claim or mutate items.';

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
    return jsonb_build_object(
      'status', 'already_claimed',
      'activityId', p_activity_id,
      'taskId', task_row.id,
      'ownerUserId', current_user_id,
      'ownerDisplayName', coalesce(current_profile.full_name, current_profile.email),
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
    'ownerDisplayName', coalesce(current_profile.full_name, current_profile.email),
    'claimedAt', task_row.claimed_at,
    'slaDueAt', task_row.sla_due_at,
    'priorityBand', priority_band,
    'instrumentationStatus', adoption_result->>'status'
  );
end;
$$;

comment on function public.knowledge_claim_outcome_work_item(uuid, text) is
  'Explicitly claims an outcome item for the authenticated user. Historical activities are instrumented only as part of this explicit action.';

create or replace function public.knowledge_release_outcome_work_item(
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
  current_role text;
  task_row public.tasks%rowtype;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 8 or length(p_idempotency_key) > 180 then
    raise exception 'Invalid idempotency key';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('knowledge:outcome:release:' || p_activity_id::text, 0));
  select role into current_role from public.user_profiles where id = current_user_id and status = 'active';

  select * into task_row
  from public.tasks task
  where task.metadata->>'knowledgeActivityId' = p_activity_id::text
    and task.status not in ('done', 'completed', 'cancelled')
  order by task.created_at desc, task.id desc
  limit 1
  for update;

  if not found then raise exception 'Open outcome task not found for activity: %', p_activity_id; end if;
  if task_row.owner_user_id is null then
    return jsonb_build_object('status', 'already_unclaimed', 'activityId', p_activity_id, 'taskId', task_row.id);
  end if;
  if task_row.owner_user_id <> current_user_id and current_role <> 'god_mode' then
    raise exception 'Only the current owner or GOD-MODE may release this outcome item';
  end if;

  update public.tasks
  set owner_user_id = null,
      claimed_at = null,
      sla_due_at = null,
      metadata = metadata || jsonb_build_object(
        'outcomeReleaseIdempotencyKey', btrim(p_idempotency_key),
        'outcomeReleasedBy', current_user_id,
        'outcomeReleasedAt', now()
      ),
      updated_at = now()
  where id = task_row.id;

  return jsonb_build_object('status', 'released', 'activityId', p_activity_id, 'taskId', task_row.id);
end;
$$;

create or replace function public.knowledge_reschedule_outcome_sla(
  p_activity_id uuid,
  p_sla_due_at timestamptz,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_role text;
  task_row public.tasks%rowtype;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 8 or length(p_idempotency_key) > 180 then
    raise exception 'Invalid idempotency key';
  end if;
  if p_sla_due_at is null or p_sla_due_at <= now() then
    raise exception 'New SLA must be in the future';
  end if;
  if p_sla_due_at > now() + interval '30 days' then
    raise exception 'Outcome SLA cannot be moved more than 30 days ahead';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'Reschedule reason must contain at least 5 characters';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('knowledge:outcome:reschedule:' || p_activity_id::text, 0));
  select role into current_role from public.user_profiles where id = current_user_id and status = 'active';

  select * into task_row
  from public.tasks task
  where task.metadata->>'knowledgeActivityId' = p_activity_id::text
    and task.status not in ('done', 'completed', 'cancelled')
  order by task.created_at desc, task.id desc
  limit 1
  for update;

  if not found then raise exception 'Open outcome task not found for activity: %', p_activity_id; end if;
  if task_row.owner_user_id is null then raise exception 'Claim the outcome item before rescheduling its SLA'; end if;
  if task_row.owner_user_id <> current_user_id and current_role <> 'god_mode' then
    raise exception 'Only the current owner or GOD-MODE may reschedule this outcome SLA';
  end if;

  update public.tasks
  set sla_due_at = p_sla_due_at,
      metadata = metadata || jsonb_build_object(
        'outcomeSlaRescheduleIdempotencyKey', btrim(p_idempotency_key),
        'outcomeSlaRescheduledBy', current_user_id,
        'outcomeSlaRescheduledAt', now(),
        'outcomeSlaRescheduleReason', btrim(p_reason),
        'outcomePreviousSlaDueAt', task_row.sla_due_at
      ),
      updated_at = now()
  where id = task_row.id;

  return jsonb_build_object(
    'status', case when task_row.sla_due_at = p_sla_due_at then 'already_scheduled' else 'rescheduled' end,
    'activityId', p_activity_id,
    'taskId', task_row.id,
    'previousSlaDueAt', task_row.sla_due_at,
    'slaDueAt', p_sla_due_at
  );
end;
$$;

revoke all on function public.knowledge_outcome_sla_workspace(uuid, integer) from public, anon;
revoke all on function public.knowledge_claim_outcome_work_item(uuid, text) from public, anon;
revoke all on function public.knowledge_release_outcome_work_item(uuid, text) from public, anon;
revoke all on function public.knowledge_reschedule_outcome_sla(uuid, timestamptz, text, text) from public, anon;

grant execute on function public.knowledge_outcome_sla_workspace(uuid, integer) to authenticated, service_role;
grant execute on function public.knowledge_claim_outcome_work_item(uuid, text) to authenticated, service_role;
grant execute on function public.knowledge_release_outcome_work_item(uuid, text) to authenticated, service_role;
grant execute on function public.knowledge_reschedule_outcome_sla(uuid, timestamptz, text, text) to authenticated, service_role;
