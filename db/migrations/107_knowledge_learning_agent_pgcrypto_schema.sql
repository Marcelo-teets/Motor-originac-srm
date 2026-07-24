-- Knowledge Learning Agent V14: qualify pgcrypto functions outside the public schema.

create or replace function public.enqueue_knowledge_learning_from_monitoring_output()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  fingerprint text;
  normalized_confidence numeric;
begin
  if new.company_id is null then return new; end if;

  normalized_confidence := public.normalize_knowledge_learning_confidence(
    coalesce(new.confidence_score, new.source_confidence, 0)
  );
  if normalized_confidence < 0.55 then return new; end if;
  if lower(coalesce(new.connector_status, '')) in ('mock', 'failed', 'error') then return new; end if;
  if lower(coalesce(new.status, '')) in ('failed', 'error', 'discarded') then return new; end if;

  fingerprint := encode(extensions.digest(concat_ws('|',
    new.id::text,
    new.company_id::text,
    coalesce(new.title, ''),
    coalesce(new.summary, ''),
    coalesce(new.raw_text, ''),
    coalesce(new.output_type, ''),
    coalesce(new.observed_at::text, ''),
    coalesce(new.confidence_score::text, new.source_confidence::text, ''),
    coalesce(new.connector_status, ''),
    coalesce(new.observed_vs_inferred, ''),
    coalesce(new.normalized_payload::text, '')
  ), 'sha256'), 'hex');

  insert into public.knowledge_learning_jobs as job (
    company_id, source_type, source_id, source_fingerprint, priority, status, available_at
  ) values (
    new.company_id,
    'monitoring_output',
    new.id,
    fingerprint,
    greatest(10, least(100, round(normalized_confidence * 100)::integer)),
    'pending',
    now()
  )
  on conflict (source_type, source_id) do update set
    company_id = excluded.company_id,
    source_fingerprint = excluded.source_fingerprint,
    priority = greatest(job.priority, excluded.priority),
    status = case when job.source_fingerprint is distinct from excluded.source_fingerprint then 'pending' else job.status end,
    attempts = case when job.source_fingerprint is distinct from excluded.source_fingerprint then 0 else job.attempts end,
    available_at = case when job.source_fingerprint is distinct from excluded.source_fingerprint then now() else job.available_at end,
    locked_at = case when job.source_fingerprint is distinct from excluded.source_fingerprint then null else job.locked_at end,
    lease_expires_at = case when job.source_fingerprint is distinct from excluded.source_fingerprint then null else job.lease_expires_at end,
    worker_id = case when job.source_fingerprint is distinct from excluded.source_fingerprint then null else job.worker_id end,
    last_error = case when job.source_fingerprint is distinct from excluded.source_fingerprint then null else job.last_error end;

  return new;
end;
$$;

create or replace function public.enqueue_knowledge_learning_from_company_signal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  fingerprint text;
  normalized_confidence numeric;
begin
  normalized_confidence := public.normalize_knowledge_learning_confidence(
    coalesce(new.confidence_score, new.confidence, 0)
  );
  if normalized_confidence < 0.50 then return new; end if;

  fingerprint := encode(extensions.digest(concat_ws('|',
    new.id::text,
    new.company_id::text,
    coalesce(new.signal_type, ''),
    coalesce(new.signal_label, ''),
    coalesce(new.evidence_text, ''),
    coalesce(new.evidence_url, ''),
    coalesce(new.observed_at::text, ''),
    coalesce(new.observed_vs_inferred, ''),
    coalesce(new.evidence_payload::text, ''),
    coalesce(new.metadata::text, '')
  ), 'sha256'), 'hex');

  insert into public.knowledge_learning_jobs as job (
    company_id, source_type, source_id, source_fingerprint, priority, status, available_at
  ) values (
    new.company_id,
    'company_signal',
    new.id,
    fingerprint,
    greatest(20, least(100, round(normalized_confidence * 100)::integer)),
    'pending',
    now()
  )
  on conflict (source_type, source_id) do update set
    company_id = excluded.company_id,
    source_fingerprint = excluded.source_fingerprint,
    priority = greatest(job.priority, excluded.priority),
    status = case when job.source_fingerprint is distinct from excluded.source_fingerprint then 'pending' else job.status end,
    attempts = case when job.source_fingerprint is distinct from excluded.source_fingerprint then 0 else job.attempts end,
    available_at = case when job.source_fingerprint is distinct from excluded.source_fingerprint then now() else job.available_at end,
    locked_at = case when job.source_fingerprint is distinct from excluded.source_fingerprint then null else job.locked_at end,
    lease_expires_at = case when job.source_fingerprint is distinct from excluded.source_fingerprint then null else job.lease_expires_at end,
    worker_id = case when job.source_fingerprint is distinct from excluded.source_fingerprint then null else job.worker_id end,
    last_error = case when job.source_fingerprint is distinct from excluded.source_fingerprint then null else job.last_error end;

  return new;
end;
$$;

create or replace function public.knowledge_enqueue_company_learning(p_company_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  job_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'Company not found';
  end if;

  insert into public.knowledge_learning_jobs (
    company_id,
    source_type,
    source_id,
    source_fingerprint,
    priority,
    status,
    attempts,
    max_attempts,
    available_at,
    locked_at,
    lease_expires_at,
    worker_id,
    last_error
  ) values (
    p_company_id,
    'manual',
    p_company_id,
    encode(extensions.digest(p_company_id::text || ':' || clock_timestamp()::text, 'sha256'), 'hex'),
    90,
    'pending',
    0,
    5,
    now(),
    null,
    null,
    null,
    null
  )
  on conflict (source_type, source_id) do update set
    company_id = excluded.company_id,
    source_fingerprint = excluded.source_fingerprint,
    priority = greatest(public.knowledge_learning_jobs.priority, excluded.priority),
    status = 'pending',
    attempts = 0,
    max_attempts = 5,
    available_at = now(),
    locked_at = null,
    lease_expires_at = null,
    worker_id = null,
    last_error = null
  returning id into job_id;

  return job_id;
end;
$$;

revoke all on function public.knowledge_enqueue_company_learning(uuid) from public, anon;
grant execute on function public.knowledge_enqueue_company_learning(uuid) to authenticated;
