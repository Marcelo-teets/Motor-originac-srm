-- V10 follow-up: pre-existing embeddings are coverage baseline, not worker spend for the current day.

create or replace function public.knowledge_claim_embedding_jobs(
  p_worker_id text,
  p_batch_size integer default 32,
  p_lease_seconds integer default 300,
  p_daily_limit integer default 128
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  normalized_worker text := btrim(coalesce(p_worker_id, ''));
  completed_today integer := 0;
  remaining_budget integer := 0;
  claimed jsonb := '[]'::jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if length(normalized_worker) < 3 or length(normalized_worker) > 120 then
    raise exception 'p_worker_id must contain between 3 and 120 characters';
  end if;
  if p_batch_size < 1 or p_batch_size > 128 then
    raise exception 'p_batch_size must be between 1 and 128';
  end if;
  if p_lease_seconds < 60 or p_lease_seconds > 3600 then
    raise exception 'p_lease_seconds must be between 60 and 3600';
  end if;
  if p_daily_limit < 1 or p_daily_limit > 5000 then
    raise exception 'p_daily_limit must be between 1 and 5000';
  end if;

  update public.knowledge_embedding_jobs
  set status = case when attempts >= max_attempts then 'dead' else 'pending' end,
      next_attempt_at = case
        when attempts >= max_attempts then next_attempt_at
        else now() + interval '5 minutes'
      end,
      locked_at = null,
      locked_by = null,
      last_error = coalesce(last_error, 'worker lease expired')
  where status = 'processing'
    and locked_at < now() - make_interval(secs => p_lease_seconds);

  select count(*)::integer into completed_today
  from public.knowledge_embedding_jobs
  where status = 'completed'
    and attempts > 0
    and completed_at >= date_trunc('day', now());

  remaining_budget := greatest(p_daily_limit - completed_today, 0);

  if remaining_budget = 0 then
    return jsonb_build_object(
      'status', 'budget_exhausted',
      'workerId', normalized_worker,
      'dailyLimit', p_daily_limit,
      'completedToday', completed_today,
      'remainingBudget', 0,
      'jobs', '[]'::jsonb
    );
  end if;

  with selected as (
    select j.id
    from public.knowledge_embedding_jobs j
    join public.vector_documents vd on vd.id = j.vector_document_id
    where j.status = 'pending'
      and j.next_attempt_at <= now()
      and j.attempts < j.max_attempts
      and vd.embedding is null
      and public.knowledge_embedding_content_hash(vd.content) = j.content_sha256
    order by j.priority desc, j.next_attempt_at, j.created_at, j.id
    for update of j skip locked
    limit least(p_batch_size, remaining_budget)
  ), updated as (
    update public.knowledge_embedding_jobs j
    set status = 'processing',
        attempts = j.attempts + 1,
        locked_at = now(),
        locked_by = normalized_worker,
        started_at = coalesce(j.started_at, now()),
        last_error = null
    from selected s
    where j.id = s.id
    returning j.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'jobId', u.id,
    'vectorDocumentId', u.vector_document_id,
    'content', vd.content,
    'metadata', vd.metadata,
    'model', u.model,
    'dimensions', u.dimensions,
    'contentSha256', u.content_sha256,
    'attempt', u.attempts,
    'maxAttempts', u.max_attempts
  ) order by u.priority desc, u.created_at, u.id), '[]'::jsonb)
  into claimed
  from updated u
  join public.vector_documents vd on vd.id = u.vector_document_id;

  return jsonb_build_object(
    'status', case when jsonb_array_length(claimed) = 0 then 'empty' else 'claimed' end,
    'workerId', normalized_worker,
    'dailyLimit', p_daily_limit,
    'completedToday', completed_today,
    'remainingBudget', remaining_budget,
    'jobs', claimed
  );
end;
$$;

create or replace function public.knowledge_embedding_coverage()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, extensions
as $$
declare
  result jsonb;
begin
  if auth.uid() is null and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  select jsonb_build_object(
    'generatedAt', now(),
    'modelContract', jsonb_build_object(
      'provider', 'Voyage AI',
      'model', 'voyage-3.5',
      'dimensions', 1024,
      'syntheticEmbeddingsAllowed', false
    ),
    'documents', jsonb_build_object(
      'total', count(*)::integer,
      'embedded', count(*) filter (where vd.embedding is not null)::integer,
      'pending', count(*) filter (where vd.embedding is null)::integer,
      'coveragePct', round(
        case when count(*) = 0 then 0 else 100.0 * count(*) filter (where vd.embedding is not null) / count(*) end,
        2
      )
    ),
    'jobs', (
      select jsonb_build_object(
        'total', count(*)::integer,
        'pending', count(*) filter (where status = 'pending')::integer,
        'processing', count(*) filter (where status = 'processing')::integer,
        'completed', count(*) filter (where status = 'completed')::integer,
        'dead', count(*) filter (where status = 'dead')::integer,
        'completedToday', count(*) filter (
          where status = 'completed'
            and attempts > 0
            and completed_at >= date_trunc('day', now())
        )::integer,
        'baselineEmbedded', count(*) filter (
          where status = 'completed' and attempts = 0
        )::integer,
        'oldestPendingAt', min(created_at) filter (where status = 'pending'),
        'lastCompletedAt', max(completed_at) filter (where status = 'completed' and attempts > 0)
      )
      from public.knowledge_embedding_jobs
    ),
    'bySource', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sourceTable', source_table,
        'documents', documents,
        'embedded', embedded,
        'pending', pending,
        'coveragePct', coverage_pct
      ) order by pending desc, documents desc, source_table)
      from (
        select
          coalesce(vd.metadata->>'source_table', vd.metadata->>'sourceTable', 'unknown') as source_table,
          count(*)::integer as documents,
          count(*) filter (where vd.embedding is not null)::integer as embedded,
          count(*) filter (where vd.embedding is null)::integer as pending,
          round(
            case when count(*) = 0 then 0 else 100.0 * count(*) filter (where vd.embedding is not null) / count(*) end,
            2
          ) as coverage_pct
        from public.vector_documents vd
        group by 1
      ) source_coverage
    ), '[]'::jsonb),
    'caveat', 'Coverage is operational telemetry only. Embedding presence or retrieval relevance never changes qualification, patterns, lead score, ranking, pipeline or credit decisions.'
  ) into result
  from public.vector_documents vd;

  return result;
end;
$$;

revoke all on function public.knowledge_claim_embedding_jobs(text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.knowledge_embedding_coverage() from public, anon;
grant execute on function public.knowledge_claim_embedding_jobs(text, integer, integer, integer) to service_role;
grant execute on function public.knowledge_embedding_coverage() to authenticated, service_role;
