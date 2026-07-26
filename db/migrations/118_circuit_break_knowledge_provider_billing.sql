-- Provider billing/configuration errors are not transient model failures. They
-- must open a global circuit breaker, release claimed jobs without consuming an
-- attempt, and stop subsequent workers before they mutate the queue.

create or replace function public.knowledge_fail_learning_run(
  p_run_id uuid,
  p_worker_id text,
  p_job_ids uuid[],
  p_error text,
  p_retry_after_seconds integer default 900
)
returns jsonb
language plpgsql
set search_path = 'public'
as $$
declare
  failed_jobs integer;
  dead_jobs integer;
  provider_blocked boolean := false;
  block_result jsonb;
  blocked_until_value timestamptz;
begin
  if current_user <> 'service_role' then raise exception 'Service role required'; end if;

  provider_blocked := lower(coalesce(p_error, '')) similar to '%(valid credit card|billing|payment method|insufficient credits|account.*suspended|credential unavailable|configure.*api_key)%';

  update public.knowledge_learning_runs
  set status = 'failed', error = left(coalesce(p_error, 'unknown error'), 5000), finished_at = now()
  where id = p_run_id
    and worker_id = left(p_worker_id, 160)
    and status = 'processing';

  if provider_blocked then
    block_result := public.knowledge_block_learning_provider(p_error, 'ai_gateway', 21600);
    blocked_until_value := (block_result->>'blockedUntil')::timestamptz;

    update public.knowledge_learning_jobs
    set
      status = 'pending',
      attempts = greatest(attempts - 1, 0),
      available_at = blocked_until_value,
      lease_expires_at = null,
      locked_at = null,
      worker_id = null,
      last_error = left(coalesce(p_error, 'provider configuration blocked'), 5000)
    where id = any(coalesce(p_job_ids, '{}'::uuid[]))
      and worker_id = left(p_worker_id, 160)
      and status = 'processing';
    get diagnostics failed_jobs = row_count;

    return jsonb_build_object(
      'status', 'provider_blocked',
      'runId', p_run_id,
      'jobsDeferred', failed_jobs,
      'blockedUntil', blocked_until_value,
      'provider', 'ai_gateway'
    );
  end if;

  update public.knowledge_learning_jobs
  set
    status = case when attempts >= max_attempts then 'dead_letter' else 'failed' end,
    available_at = case when attempts >= max_attempts then available_at else now() + make_interval(secs => greatest(60, least(coalesce(p_retry_after_seconds, 900), 86400))) end,
    lease_expires_at = null,
    locked_at = null,
    worker_id = null,
    last_error = left(coalesce(p_error, 'unknown error'), 5000)
  where id = any(coalesce(p_job_ids, '{}'::uuid[]))
    and worker_id = left(p_worker_id, 160)
    and status = 'processing';
  get diagnostics failed_jobs = row_count;

  select count(*)::integer into dead_jobs
  from public.knowledge_learning_jobs
  where id = any(coalesce(p_job_ids, '{}'::uuid[]))
    and status = 'dead_letter';

  return jsonb_build_object('status', 'failed', 'runId', p_run_id, 'jobsReleased', failed_jobs, 'deadLetters', dead_jobs);
end;
$$;

revoke execute on function public.knowledge_fail_learning_run(uuid, text, uuid[], text, integer) from public, anon, authenticated;
grant execute on function public.knowledge_fail_learning_run(uuid, text, uuid[], text, integer) to service_role;

-- Reconcile provider configuration failures already observed during governed
-- production smokes. Preserve messages and lineage, restore jobs without
-- consuming attempts, and block the provider globally for six hours.
do $reconcile$
declare
  provider_error text;
  blocked_until_value timestamptz := now() + interval '6 hours';
begin
  select max(last_error) into provider_error
  from public.knowledge_learning_jobs
  where status = 'failed'
    and lower(coalesce(last_error, '')) similar to '%(valid credit card|billing|payment method|insufficient credits|account.*suspended|credential unavailable|configure.*api_key)%';

  if provider_error is not null then
    insert into public.knowledge_learning_runtime_state as state (
      singleton, provider_status, blocked_until, last_error, last_provider, updated_at
    ) values (
      true, 'blocked', blocked_until_value, left(provider_error, 5000), 'ai_gateway', now()
    )
    on conflict (singleton) do update set
      provider_status = excluded.provider_status,
      blocked_until = excluded.blocked_until,
      last_error = excluded.last_error,
      last_provider = excluded.last_provider,
      updated_at = excluded.updated_at;

    update public.knowledge_learning_jobs
    set
      status = 'pending',
      attempts = greatest(attempts - 1, 0),
      available_at = blocked_until_value,
      locked_at = null,
      lease_expires_at = null,
      worker_id = null,
      last_error = left(provider_error, 5000)
    where status = 'failed'
      and lower(coalesce(last_error, '')) similar to '%(valid credit card|billing|payment method|insufficient credits|account.*suspended|credential unavailable|configure.*api_key)%';
  end if;
end;
$reconcile$;

notify pgrst, 'reload schema';
