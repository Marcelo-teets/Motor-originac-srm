-- Knowledge Learning Agent V14: authenticated manual enqueue without SECURITY DEFINER.

grant insert, update on public.knowledge_learning_jobs to authenticated;

drop policy if exists knowledge_learning_jobs_manual_insert on public.knowledge_learning_jobs;
create policy knowledge_learning_jobs_manual_insert
  on public.knowledge_learning_jobs
  for insert
  to authenticated
  with check (
    source_type = 'manual'
    and source_id = company_id
    and priority = 90
    and status = 'pending'
    and attempts = 0
    and max_attempts = 5
    and worker_id is null
    and locked_at is null
    and lease_expires_at is null
  );

drop policy if exists knowledge_learning_jobs_manual_update on public.knowledge_learning_jobs;
create policy knowledge_learning_jobs_manual_update
  on public.knowledge_learning_jobs
  for update
  to authenticated
  using (source_type = 'manual' and source_id = company_id)
  with check (
    source_type = 'manual'
    and source_id = company_id
    and priority >= 90
    and status = 'pending'
    and attempts = 0
    and worker_id is null
    and locked_at is null
    and lease_expires_at is null
  );

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
    encode(digest(p_company_id::text || ':' || clock_timestamp()::text, 'sha256'), 'hex'),
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
