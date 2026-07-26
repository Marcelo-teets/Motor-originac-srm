-- Govern the Knowledge Learning Agent queue around real, monitoring-eligible
-- companies and make provider configuration failures explicit and fail-closed.

create or replace function public.is_company_learning_eligible(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.companies company
    where company.id = p_company_id
      and lower(coalesce(company.metadata->>'data_status', '')) = 'real'
      and lower(coalesce(company.metadata->>'synthetic_seed', 'false')) <> 'true'
      and lower(coalesce(company.metadata->>'identity_verified', 'false')) = 'true'
      and lower(coalesce(company.metadata->>'monitoring_eligible', 'false')) = 'true'
  );
$$;

revoke execute on function public.is_company_learning_eligible(uuid) from public, anon;
grant execute on function public.is_company_learning_eligible(uuid) to authenticated, service_role;

create table if not exists public.knowledge_learning_runtime_state (
  singleton boolean primary key default true check (singleton),
  provider_status text not null default 'ready' check (provider_status in ('ready', 'blocked')),
  blocked_until timestamptz,
  last_error text,
  last_provider text,
  updated_at timestamptz not null default now()
);

insert into public.knowledge_learning_runtime_state (singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.knowledge_learning_runtime_state enable row level security;
revoke all on public.knowledge_learning_runtime_state from public, anon, authenticated;
grant select, insert, update on public.knowledge_learning_runtime_state to service_role;

create or replace function public.knowledge_block_learning_provider(
  p_error text,
  p_provider text default 'ai_gateway',
  p_retry_after_seconds integer default 21600
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  blocked_until_value timestamptz;
begin
  if current_user <> 'service_role' then raise exception 'Service role required'; end if;
  blocked_until_value := now() + make_interval(secs => greatest(900, least(coalesce(p_retry_after_seconds, 21600), 86400)));
  insert into public.knowledge_learning_runtime_state as state (
    singleton, provider_status, blocked_until, last_error, last_provider, updated_at
  ) values (
    true, 'blocked', blocked_until_value, left(coalesce(p_error, 'provider blocked'), 5000), left(coalesce(p_provider, 'unknown'), 120), now()
  )
  on conflict (singleton) do update set
    provider_status = excluded.provider_status,
    blocked_until = excluded.blocked_until,
    last_error = excluded.last_error,
    last_provider = excluded.last_provider,
    updated_at = excluded.updated_at;
  return jsonb_build_object('status', 'blocked', 'blockedUntil', blocked_until_value, 'provider', left(coalesce(p_provider, 'unknown'), 120));
end;
$$;

create or replace function public.knowledge_defer_learning_jobs(
  p_worker_id text,
  p_job_ids uuid[],
  p_error text,
  p_available_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare deferred_count integer;
begin
  if current_user <> 'service_role' then raise exception 'Service role required'; end if;
  update public.knowledge_learning_jobs
  set
    status = 'pending',
    attempts = greatest(attempts - 1, 0),
    available_at = greatest(coalesce(p_available_at, now() + interval '6 hours'), now() + interval '15 minutes'),
    locked_at = null,
    lease_expires_at = null,
    worker_id = null,
    last_error = left(coalesce(p_error, 'provider temporarily blocked'), 5000)
  where id = any(coalesce(p_job_ids, '{}'::uuid[]))
    and worker_id = left(coalesce(p_worker_id, ''), 160)
    and status = 'processing';
  get diagnostics deferred_count = row_count;
  return jsonb_build_object('status', 'deferred', 'jobsDeferred', deferred_count);
end;
$$;

revoke execute on function public.knowledge_block_learning_provider(text, text, integer) from public, anon, authenticated;
revoke execute on function public.knowledge_defer_learning_jobs(text, uuid[], text, timestamptz) from public, anon, authenticated;
grant execute on function public.knowledge_block_learning_provider(text, text, integer) to service_role;
grant execute on function public.knowledge_defer_learning_jobs(text, uuid[], text, timestamptz) to service_role;

create or replace function public.enqueue_knowledge_learning_from_company_signal()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare fingerprint text; normalized_confidence numeric;
begin
  if not public.is_company_learning_eligible(new.company_id) then return new; end if;
  normalized_confidence := public.normalize_knowledge_learning_confidence(coalesce(new.confidence_score, new.confidence, 0));
  if normalized_confidence < 0.50 then return new; end if;
  fingerprint := encode(extensions.digest(concat_ws('|', new.id::text, new.company_id::text, coalesce(new.signal_type, ''), coalesce(new.signal_label, ''), coalesce(new.evidence_text, ''), coalesce(new.evidence_url, ''), coalesce(new.observed_at::text, ''), coalesce(new.observed_vs_inferred, ''), coalesce(new.evidence_payload::text, ''), coalesce(new.metadata::text, '')), 'sha256'), 'hex');
  insert into public.knowledge_learning_jobs as job (company_id, source_type, source_id, source_fingerprint, priority, status, available_at)
  values (new.company_id, 'company_signal', new.id, fingerprint, greatest(20, least(100, round(normalized_confidence * 100)::integer)), 'pending', now())
  on conflict (source_type, source_id) do update set company_id=excluded.company_id, source_fingerprint=excluded.source_fingerprint, priority=greatest(job.priority, excluded.priority), status=case when job.source_fingerprint is distinct from excluded.source_fingerprint then 'pending' else job.status end, attempts=case when job.source_fingerprint is distinct from excluded.source_fingerprint then 0 else job.attempts end, available_at=case when job.source_fingerprint is distinct from excluded.source_fingerprint then now() else job.available_at end, locked_at=case when job.source_fingerprint is distinct from excluded.source_fingerprint then null else job.locked_at end, lease_expires_at=case when job.source_fingerprint is distinct from excluded.source_fingerprint then null else job.lease_expires_at end, worker_id=case when job.source_fingerprint is distinct from excluded.source_fingerprint then null else job.worker_id end, last_error=case when job.source_fingerprint is distinct from excluded.source_fingerprint then null else job.last_error end;
  return new;
end;
$$;

create or replace function public.enqueue_knowledge_learning_from_monitoring_output()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare fingerprint text; normalized_confidence numeric;
begin
  if new.company_id is null or not public.is_company_learning_eligible(new.company_id) then return new; end if;
  normalized_confidence := public.normalize_knowledge_learning_confidence(coalesce(new.confidence_score, new.source_confidence, 0));
  if normalized_confidence < 0.55 then return new; end if;
  if lower(coalesce(new.connector_status, '')) in ('mock', 'failed', 'error') then return new; end if;
  if lower(coalesce(new.status, '')) in ('failed', 'error', 'discarded') then return new; end if;
  fingerprint := encode(extensions.digest(concat_ws('|', new.id::text, new.company_id::text, coalesce(new.title, ''), coalesce(new.summary, ''), coalesce(new.raw_text, ''), coalesce(new.output_type, ''), coalesce(new.observed_at::text, ''), coalesce(new.confidence_score::text, new.source_confidence::text, ''), coalesce(new.connector_status, ''), coalesce(new.observed_vs_inferred, ''), coalesce(new.normalized_payload::text, '')), 'sha256'), 'hex');
  insert into public.knowledge_learning_jobs as job (company_id, source_type, source_id, source_fingerprint, priority, status, available_at)
  values (new.company_id, 'monitoring_output', new.id, fingerprint, greatest(10, least(100, round(normalized_confidence * 100)::integer)), 'pending', now())
  on conflict (source_type, source_id) do update set company_id=excluded.company_id, source_fingerprint=excluded.source_fingerprint, priority=greatest(job.priority, excluded.priority), status=case when job.source_fingerprint is distinct from excluded.source_fingerprint then 'pending' else job.status end, attempts=case when job.source_fingerprint is distinct from excluded.source_fingerprint then 0 else job.attempts end, available_at=case when job.source_fingerprint is distinct from excluded.source_fingerprint then now() else job.available_at end, locked_at=case when job.source_fingerprint is distinct from excluded.source_fingerprint then null else job.locked_at end, lease_expires_at=case when job.source_fingerprint is distinct from excluded.source_fingerprint then null else job.lease_expires_at end, worker_id=case when job.source_fingerprint is distinct from excluded.source_fingerprint then null else job.worker_id end, last_error=case when job.source_fingerprint is distinct from excluded.source_fingerprint then null else job.last_error end;
  return new;
end;
$$;

-- Archive queued work for synthetic/mock companies without deleting lineage.
update public.knowledge_learning_jobs job
set status = 'dead_letter', locked_at = null, lease_expires_at = null, worker_id = null,
    last_error = 'archived: company_not_learning_eligible', updated_at = now()
where status in ('pending', 'failed', 'processing')
  and not public.is_company_learning_eligible(job.company_id);

-- Replace the claim function so blocked providers and ineligible companies never
-- consume attempts or model budget.
create or replace function public.knowledge_claim_learning_jobs(p_worker_id text, p_batch_size integer default 32, p_lease_seconds integer default 900, p_daily_limit integer default 48)
returns jsonb
language plpgsql
set search_path = 'public'
as $$
declare claimed jsonb := '[]'::jsonb; completed_today integer := 0; bounded_batch integer := greatest(1, least(coalesce(p_batch_size, 32), 128)); bounded_lease integer := greatest(60, least(coalesce(p_lease_seconds, 900), 3600)); bounded_daily integer := greatest(1, least(coalesce(p_daily_limit, 48), 1000)); runtime_state public.knowledge_learning_runtime_state%rowtype;
begin
  if current_user <> 'service_role' then raise exception 'Service role required'; end if;
  select * into runtime_state from public.knowledge_learning_runtime_state where singleton = true;
  if runtime_state.provider_status = 'blocked' and runtime_state.blocked_until > now() then
    return jsonb_build_object('status', 'provider_blocked', 'workerId', p_worker_id, 'blockedUntil', runtime_state.blocked_until, 'provider', runtime_state.last_provider, 'error', runtime_state.last_error, 'jobs', '[]'::jsonb);
  elsif runtime_state.provider_status = 'blocked' then
    update public.knowledge_learning_runtime_state set provider_status='ready', blocked_until=null, last_error=null, updated_at=now() where singleton=true;
  end if;
  select count(*)::integer into completed_today from public.knowledge_learning_runs where status in ('completed', 'partial') and started_at >= date_trunc('day', now());
  if completed_today >= bounded_daily then return jsonb_build_object('status', 'budget_exhausted', 'workerId', p_worker_id, 'dailyLimit', bounded_daily, 'completedToday', completed_today, 'jobs', '[]'::jsonb); end if;
  with candidates as (
    select job.id from public.knowledge_learning_jobs job
    where job.attempts < job.max_attempts and job.available_at <= now()
      and public.is_company_learning_eligible(job.company_id)
      and (job.status in ('pending','failed') or (job.status='processing' and coalesce(job.lease_expires_at, '-infinity'::timestamptz) <= now()))
    order by job.priority desc, job.created_at limit bounded_batch for update skip locked
  ), claimed_rows as (
    update public.knowledge_learning_jobs job set status='processing', attempts=job.attempts+1, locked_at=now(), lease_expires_at=now()+make_interval(secs=>bounded_lease), worker_id=left(coalesce(p_worker_id,'knowledge-worker'),160), last_error=null from candidates where job.id=candidates.id returning job.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('jobId',id,'companyId',company_id,'sourceType',source_type,'sourceId',source_id,'sourceFingerprint',source_fingerprint,'priority',priority,'attempt',attempts,'maxAttempts',max_attempts) order by priority desc,created_at),'[]'::jsonb) into claimed from claimed_rows;
  return jsonb_build_object('status', case when jsonb_array_length(claimed)>0 then 'claimed' else 'empty' end, 'workerId',p_worker_id,'dailyLimit',bounded_daily,'completedToday',completed_today,'jobs',claimed);
end;
$$;

revoke execute on function public.knowledge_claim_learning_jobs(text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.knowledge_claim_learning_jobs(text, integer, integer, integer) to service_role;

notify pgrst, 'reload schema';
