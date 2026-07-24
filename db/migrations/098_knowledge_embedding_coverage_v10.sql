-- Knowledge Vault V10: real embedding coverage queue, leases, retries and observability.
-- The queue never fabricates vectors and preserves the current Voyage 3.5 / 1024d corpus contract.

create table if not exists public.knowledge_embedding_jobs (
  id uuid primary key default gen_random_uuid(),
  vector_document_id uuid not null unique references public.vector_documents(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'dead')),
  model text not null default 'voyage-3.5',
  dimensions integer not null default 1024 check (dimensions = 1024),
  content_sha256 text not null,
  priority smallint not null default 50 check (priority between 0 and 100),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  provider_request_id text,
  usage_tokens integer check (usage_tokens is null or usage_tokens >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.knowledge_embedding_jobs is
  'Service-role-only queue for generating real 1024-dimensional Voyage embeddings for vector_documents.';

create index if not exists idx_knowledge_embedding_jobs_claim
  on public.knowledge_embedding_jobs (status, next_attempt_at, priority desc, created_at)
  where status = 'pending';

create index if not exists idx_knowledge_embedding_jobs_processing_lease
  on public.knowledge_embedding_jobs (locked_at)
  where status = 'processing';

create index if not exists idx_knowledge_embedding_jobs_completed_at
  on public.knowledge_embedding_jobs (completed_at desc)
  where status = 'completed';

alter table public.knowledge_embedding_jobs enable row level security;

revoke all on table public.knowledge_embedding_jobs from public, anon, authenticated;
grant all on table public.knowledge_embedding_jobs to service_role;

create or replace function public.knowledge_embedding_content_hash(p_content text)
returns text
language sql
immutable
strict
set search_path = public, extensions
as $$
  select encode(extensions.digest(convert_to(p_content, 'UTF8'), 'sha256'), 'hex');
$$;

create or replace function public.knowledge_embedding_jobs_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.knowledge_invalidate_stale_embedding()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.content is distinct from old.content
     and new.embedding is not distinct from old.embedding then
    new.embedding := null;
    new.metadata := coalesce(new.metadata, '{}'::jsonb)
      - 'embedding_model'
      - 'embedding_dimensions'
      - 'embedding_content_sha256'
      - 'embedded_at'
      - 'embedding_provider_request_id';
  end if;

  return new;
end;
$$;

create or replace function public.knowledge_queue_embedding_on_document_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  document_hash text;
begin
  if new.embedding is not null or length(btrim(new.content)) = 0 then
    return new;
  end if;

  document_hash := public.knowledge_embedding_content_hash(new.content);

  insert into public.knowledge_embedding_jobs (
    vector_document_id,
    status,
    model,
    dimensions,
    content_sha256,
    priority,
    attempts,
    next_attempt_at,
    locked_at,
    locked_by,
    last_error,
    completed_at
  ) values (
    new.id,
    'pending',
    'voyage-3.5',
    1024,
    document_hash,
    case
      when coalesce(new.metadata->>'source_table', new.metadata->>'sourceTable') = 'knowledge_nodes' then 90
      when coalesce(new.metadata->>'source_table', new.metadata->>'sourceTable') = 'thesis_outputs' then 80
      when coalesce(new.metadata->>'source_table', new.metadata->>'sourceTable') = 'company_signals' then 70
      else 50
    end,
    0,
    now(),
    null,
    null,
    null,
    null
  )
  on conflict (vector_document_id) do update
  set status = case
        when public.knowledge_embedding_jobs.content_sha256 is distinct from excluded.content_sha256
          then 'pending'
        when public.knowledge_embedding_jobs.status = 'dead'
          then 'pending'
        else public.knowledge_embedding_jobs.status
      end,
      model = excluded.model,
      dimensions = excluded.dimensions,
      content_sha256 = excluded.content_sha256,
      priority = greatest(public.knowledge_embedding_jobs.priority, excluded.priority),
      attempts = case
        when public.knowledge_embedding_jobs.content_sha256 is distinct from excluded.content_sha256 then 0
        when public.knowledge_embedding_jobs.status = 'dead' then 0
        else public.knowledge_embedding_jobs.attempts
      end,
      next_attempt_at = case
        when public.knowledge_embedding_jobs.content_sha256 is distinct from excluded.content_sha256 then now()
        when public.knowledge_embedding_jobs.status = 'dead' then now()
        else public.knowledge_embedding_jobs.next_attempt_at
      end,
      locked_at = case
        when public.knowledge_embedding_jobs.content_sha256 is distinct from excluded.content_sha256 then null
        else public.knowledge_embedding_jobs.locked_at
      end,
      locked_by = case
        when public.knowledge_embedding_jobs.content_sha256 is distinct from excluded.content_sha256 then null
        else public.knowledge_embedding_jobs.locked_by
      end,
      last_error = case
        when public.knowledge_embedding_jobs.content_sha256 is distinct from excluded.content_sha256 then null
        else public.knowledge_embedding_jobs.last_error
      end,
      completed_at = case
        when public.knowledge_embedding_jobs.content_sha256 is distinct from excluded.content_sha256 then null
        else public.knowledge_embedding_jobs.completed_at
      end;

  return new;
end;
$$;

drop trigger if exists trg_knowledge_embedding_jobs_touch_updated_at on public.knowledge_embedding_jobs;
create trigger trg_knowledge_embedding_jobs_touch_updated_at
before update on public.knowledge_embedding_jobs
for each row execute function public.knowledge_embedding_jobs_touch_updated_at();

drop trigger if exists trg_knowledge_invalidate_stale_embedding on public.vector_documents;
create trigger trg_knowledge_invalidate_stale_embedding
before update of content, embedding on public.vector_documents
for each row execute function public.knowledge_invalidate_stale_embedding();

drop trigger if exists trg_knowledge_queue_embedding_on_document_change on public.vector_documents;
create trigger trg_knowledge_queue_embedding_on_document_change
after insert or update of content, embedding on public.vector_documents
for each row execute function public.knowledge_queue_embedding_on_document_change();

create or replace function public.knowledge_enqueue_embedding_jobs(p_limit integer default 5000)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  affected integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if p_limit < 1 or p_limit > 20000 then
    raise exception 'p_limit must be between 1 and 20000';
  end if;

  with candidates as (
    select
      vd.id,
      vd.embedding,
      public.knowledge_embedding_content_hash(vd.content) as content_hash,
      case
        when coalesce(vd.metadata->>'source_table', vd.metadata->>'sourceTable') = 'knowledge_nodes' then 90
        when coalesce(vd.metadata->>'source_table', vd.metadata->>'sourceTable') = 'thesis_outputs' then 80
        when coalesce(vd.metadata->>'source_table', vd.metadata->>'sourceTable') = 'company_signals' then 70
        else 50
      end as job_priority
    from public.vector_documents vd
    where length(btrim(vd.content)) > 0
    order by vd.created_at, vd.id
    limit p_limit
  ), upserted as (
    insert into public.knowledge_embedding_jobs (
      vector_document_id,
      status,
      model,
      dimensions,
      content_sha256,
      priority,
      attempts,
      next_attempt_at,
      completed_at
    )
    select
      c.id,
      case when c.embedding is null then 'pending' else 'completed' end,
      'voyage-3.5',
      1024,
      c.content_hash,
      c.job_priority,
      0,
      now(),
      case when c.embedding is null then null else now() end
    from candidates c
    on conflict (vector_document_id) do update
    set status = case
          when excluded.content_sha256 is distinct from public.knowledge_embedding_jobs.content_sha256 then 'pending'
          when public.knowledge_embedding_jobs.status = 'dead' then 'pending'
          else public.knowledge_embedding_jobs.status
        end,
        content_sha256 = excluded.content_sha256,
        priority = greatest(public.knowledge_embedding_jobs.priority, excluded.priority),
        attempts = case
          when excluded.content_sha256 is distinct from public.knowledge_embedding_jobs.content_sha256 then 0
          when public.knowledge_embedding_jobs.status = 'dead' then 0
          else public.knowledge_embedding_jobs.attempts
        end,
        next_attempt_at = case
          when excluded.content_sha256 is distinct from public.knowledge_embedding_jobs.content_sha256 then now()
          when public.knowledge_embedding_jobs.status = 'dead' then now()
          else public.knowledge_embedding_jobs.next_attempt_at
        end,
        locked_at = case
          when excluded.content_sha256 is distinct from public.knowledge_embedding_jobs.content_sha256 then null
          else public.knowledge_embedding_jobs.locked_at
        end,
        locked_by = case
          when excluded.content_sha256 is distinct from public.knowledge_embedding_jobs.content_sha256 then null
          else public.knowledge_embedding_jobs.locked_by
        end,
        last_error = case
          when excluded.content_sha256 is distinct from public.knowledge_embedding_jobs.content_sha256 then null
          else public.knowledge_embedding_jobs.last_error
        end,
        completed_at = case
          when excluded.content_sha256 is distinct from public.knowledge_embedding_jobs.content_sha256 then null
          else public.knowledge_embedding_jobs.completed_at
        end
    returning 1
  )
  select count(*)::integer into affected from upserted;

  return jsonb_build_object(
    'status', 'real',
    'affected', affected,
    'coverage', public.knowledge_embedding_coverage()
  );
end;
$$;

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

create or replace function public.knowledge_complete_embedding_job(
  p_job_id uuid,
  p_worker_id text,
  p_embedding extensions.vector(1024),
  p_provider_request_id text default null,
  p_usage_tokens integer default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  target_job public.knowledge_embedding_jobs%rowtype;
  current_hash text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_embedding is null then
    raise exception 'A real embedding is required';
  end if;
  if p_usage_tokens is not null and p_usage_tokens < 0 then
    raise exception 'p_usage_tokens must be non-negative';
  end if;

  select * into target_job
  from public.knowledge_embedding_jobs
  where id = p_job_id
  for update;

  if target_job.id is null then
    raise exception 'Embedding job not found';
  end if;
  if target_job.status <> 'processing' or target_job.locked_by is distinct from btrim(p_worker_id) then
    raise exception 'Embedding job is not owned by this worker';
  end if;

  select public.knowledge_embedding_content_hash(content) into current_hash
  from public.vector_documents
  where id = target_job.vector_document_id
  for update;

  if current_hash is distinct from target_job.content_sha256 then
    update public.knowledge_embedding_jobs
    set status = 'pending',
        attempts = 0,
        content_sha256 = current_hash,
        next_attempt_at = now(),
        locked_at = null,
        locked_by = null,
        last_error = 'document content changed while embedding was generated'
    where id = target_job.id;

    return jsonb_build_object('status', 'stale', 'jobId', target_job.id);
  end if;

  update public.vector_documents
  set embedding = p_embedding,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'embedding_model', target_job.model,
        'embedding_dimensions', target_job.dimensions,
        'embedding_content_sha256', target_job.content_sha256,
        'embedded_at', now(),
        'embedding_provider_request_id', nullif(btrim(coalesce(p_provider_request_id, '')), '')
      )
  where id = target_job.vector_document_id;

  update public.knowledge_embedding_jobs
  set status = 'completed',
      completed_at = now(),
      locked_at = null,
      locked_by = null,
      last_error = null,
      provider_request_id = nullif(btrim(coalesce(p_provider_request_id, '')), ''),
      usage_tokens = p_usage_tokens
  where id = target_job.id;

  return jsonb_build_object(
    'status', 'completed',
    'jobId', target_job.id,
    'vectorDocumentId', target_job.vector_document_id,
    'model', target_job.model,
    'dimensions', target_job.dimensions
  );
end;
$$;

create or replace function public.knowledge_fail_embedding_job(
  p_job_id uuid,
  p_worker_id text,
  p_error text,
  p_retry_after_seconds integer default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_job public.knowledge_embedding_jobs%rowtype;
  terminal boolean;
  retry_seconds integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select * into target_job
  from public.knowledge_embedding_jobs
  where id = p_job_id
  for update;

  if target_job.id is null then
    raise exception 'Embedding job not found';
  end if;
  if target_job.status <> 'processing' or target_job.locked_by is distinct from btrim(p_worker_id) then
    raise exception 'Embedding job is not owned by this worker';
  end if;

  terminal := target_job.attempts >= target_job.max_attempts;
  retry_seconds := coalesce(
    p_retry_after_seconds,
    least(21600, 60 * (2 ^ greatest(target_job.attempts - 1, 0)))::integer
  );

  if retry_seconds < 30 or retry_seconds > 86400 then
    raise exception 'retry delay must be between 30 and 86400 seconds';
  end if;

  update public.knowledge_embedding_jobs
  set status = case when terminal then 'dead' else 'pending' end,
      next_attempt_at = case when terminal then next_attempt_at else now() + make_interval(secs => retry_seconds) end,
      locked_at = null,
      locked_by = null,
      last_error = left(coalesce(nullif(btrim(p_error), ''), 'unknown embedding error'), 2000)
  where id = target_job.id;

  return jsonb_build_object(
    'status', case when terminal then 'dead' else 'retry_scheduled' end,
    'jobId', target_job.id,
    'attempt', target_job.attempts,
    'maxAttempts', target_job.max_attempts,
    'retryAfterSeconds', case when terminal then null else retry_seconds end
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
          where status = 'completed' and completed_at >= date_trunc('day', now())
        )::integer,
        'oldestPendingAt', min(created_at) filter (where status = 'pending'),
        'lastCompletedAt', max(completed_at) filter (where status = 'completed')
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

revoke all on function public.knowledge_embedding_content_hash(text) from public, anon, authenticated;
revoke all on function public.knowledge_enqueue_embedding_jobs(integer) from public, anon, authenticated;
revoke all on function public.knowledge_claim_embedding_jobs(text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.knowledge_complete_embedding_job(uuid, text, extensions.vector, text, integer) from public, anon, authenticated;
revoke all on function public.knowledge_fail_embedding_job(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.knowledge_embedding_coverage() from public, anon;

grant execute on function public.knowledge_embedding_content_hash(text) to service_role;
grant execute on function public.knowledge_enqueue_embedding_jobs(integer) to service_role;
grant execute on function public.knowledge_claim_embedding_jobs(text, integer, integer, integer) to service_role;
grant execute on function public.knowledge_complete_embedding_job(uuid, text, extensions.vector, text, integer) to service_role;
grant execute on function public.knowledge_fail_embedding_job(uuid, text, text, integer) to service_role;
grant execute on function public.knowledge_embedding_coverage() to authenticated, service_role;

-- Seed the operational queue without generating or fabricating embeddings.
insert into public.knowledge_embedding_jobs (
  vector_document_id,
  status,
  model,
  dimensions,
  content_sha256,
  priority,
  attempts,
  next_attempt_at,
  completed_at
)
select
  vd.id,
  case when vd.embedding is null then 'pending' else 'completed' end,
  'voyage-3.5',
  1024,
  public.knowledge_embedding_content_hash(vd.content),
  case
    when coalesce(vd.metadata->>'source_table', vd.metadata->>'sourceTable') = 'knowledge_nodes' then 90
    when coalesce(vd.metadata->>'source_table', vd.metadata->>'sourceTable') = 'thesis_outputs' then 80
    when coalesce(vd.metadata->>'source_table', vd.metadata->>'sourceTable') = 'company_signals' then 70
    else 50
  end,
  0,
  now(),
  case when vd.embedding is null then null else now() end
from public.vector_documents vd
where length(btrim(vd.content)) > 0
on conflict (vector_document_id) do nothing;
