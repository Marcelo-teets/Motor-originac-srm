-- Knowledge Vault V14: governed LLM learning agent and living mind maps.

create table if not exists public.knowledge_learning_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_type text not null check (source_type in ('monitoring_output', 'company_signal', 'manual')),
  source_id uuid not null,
  source_fingerprint text not null,
  priority smallint not null default 50 check (priority between 0 and 100),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'dead_letter')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  lease_expires_at timestamptz,
  worker_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create index if not exists idx_knowledge_learning_jobs_claim
  on public.knowledge_learning_jobs (status, available_at, priority desc, created_at)
  where status in ('pending', 'failed', 'processing');
create index if not exists idx_knowledge_learning_jobs_company
  on public.knowledge_learning_jobs (company_id, created_at desc);

create table if not exists public.knowledge_learning_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  worker_id text not null,
  model text not null,
  status text not null default 'processing' check (status in ('processing', 'completed', 'partial', 'failed')),
  job_ids uuid[] not null default '{}'::uuid[],
  input_hash text,
  prompt_hash text,
  context_snapshot jsonb not null default '{}'::jsonb,
  result_json jsonb not null default '{}'::jsonb,
  usage_json jsonb not null default '{}'::jsonb,
  nodes_created integer not null default 0,
  nodes_updated integer not null default 0,
  links_applied integer not null default 0,
  references_applied integer not null default 0,
  error text,
  deployment jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_knowledge_learning_runs_company
  on public.knowledge_learning_runs (company_id, started_at desc);
create index if not exists idx_knowledge_learning_runs_status
  on public.knowledge_learning_runs (status, started_at desc);

alter table public.knowledge_learning_jobs enable row level security;
alter table public.knowledge_learning_runs enable row level security;
drop policy if exists knowledge_learning_jobs_select on public.knowledge_learning_jobs;
create policy knowledge_learning_jobs_select on public.knowledge_learning_jobs for select to authenticated using (true);
drop policy if exists knowledge_learning_runs_select on public.knowledge_learning_runs;
create policy knowledge_learning_runs_select on public.knowledge_learning_runs for select to authenticated using (true);
grant select on public.knowledge_learning_jobs to authenticated;
grant select on public.knowledge_learning_runs to authenticated;
grant all on public.knowledge_learning_jobs to service_role;
grant all on public.knowledge_learning_runs to service_role;

create or replace function public.touch_knowledge_learning_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists trg_touch_knowledge_learning_jobs on public.knowledge_learning_jobs;
create trigger trg_touch_knowledge_learning_jobs before update on public.knowledge_learning_jobs
for each row execute function public.touch_knowledge_learning_updated_at();

create or replace function public.normalize_knowledge_learning_confidence(value numeric)
returns numeric language sql immutable returns null on null input set search_path = public as $$
  select greatest(0::numeric, least(1::numeric, case when value > 1 then value / 100 else value end));
$$;

create or replace function public.enqueue_knowledge_learning_from_monitoring_output()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare fingerprint text; normalized_confidence numeric;
begin
  if new.company_id is null then return new; end if;
  normalized_confidence := public.normalize_knowledge_learning_confidence(coalesce(new.confidence_score, new.source_confidence, 0));
  if normalized_confidence < 0.55 then return new; end if;
  if lower(coalesce(new.connector_status, '')) in ('mock', 'failed', 'error') then return new; end if;
  if lower(coalesce(new.status, '')) in ('failed', 'error', 'discarded') then return new; end if;
  fingerprint := encode(digest(concat_ws('|', new.id::text, new.company_id::text, coalesce(new.title, ''),
    coalesce(new.summary, ''), coalesce(new.raw_text, ''), coalesce(new.output_type, ''), coalesce(new.observed_at::text, ''),
    coalesce(new.confidence_score::text, new.source_confidence::text, ''), coalesce(new.connector_status, ''),
    coalesce(new.observed_vs_inferred, ''), coalesce(new.normalized_payload::text, '')), 'sha256'), 'hex');
  insert into public.knowledge_learning_jobs as job
    (company_id, source_type, source_id, source_fingerprint, priority, status, available_at)
  values (new.company_id, 'monitoring_output', new.id, fingerprint,
    greatest(10, least(100, round(normalized_confidence * 100)::integer)), 'pending', now())
  on conflict (source_type, source_id) do update set
    company_id = excluded.company_id, source_fingerprint = excluded.source_fingerprint,
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
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare fingerprint text; normalized_confidence numeric;
begin
  normalized_confidence := public.normalize_knowledge_learning_confidence(coalesce(new.confidence_score, new.confidence, 0));
  if normalized_confidence < 0.50 then return new; end if;
  fingerprint := encode(digest(concat_ws('|', new.id::text, new.company_id::text, coalesce(new.signal_type, ''),
    coalesce(new.signal_label, ''), coalesce(new.evidence_text, ''), coalesce(new.evidence_url, ''),
    coalesce(new.observed_at::text, ''), coalesce(new.observed_vs_inferred, ''), coalesce(new.evidence_payload::text, ''),
    coalesce(new.metadata::text, '')), 'sha256'), 'hex');
  insert into public.knowledge_learning_jobs as job
    (company_id, source_type, source_id, source_fingerprint, priority, status, available_at)
  values (new.company_id, 'company_signal', new.id, fingerprint,
    greatest(20, least(100, round(normalized_confidence * 100)::integer)), 'pending', now())
  on conflict (source_type, source_id) do update set
    company_id = excluded.company_id, source_fingerprint = excluded.source_fingerprint,
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

drop trigger if exists trg_enqueue_knowledge_learning_monitoring on public.monitoring_outputs;
create trigger trg_enqueue_knowledge_learning_monitoring
  after insert or update of title, summary, raw_text, status, confidence_score, source_confidence, connector_status, observed_vs_inferred, normalized_payload
  on public.monitoring_outputs for each row execute function public.enqueue_knowledge_learning_from_monitoring_output();
drop trigger if exists trg_enqueue_knowledge_learning_signal on public.company_signals;
create trigger trg_enqueue_knowledge_learning_signal
  after insert or update of signal_type, signal_label, evidence_text, evidence_url, confidence, confidence_score, observed_vs_inferred, evidence_payload, metadata
  on public.company_signals for each row execute function public.enqueue_knowledge_learning_from_company_signal();

create or replace function public.knowledge_enqueue_company_learning(p_company_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare job_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.companies where id = p_company_id) then raise exception 'Company not found'; end if;
  insert into public.knowledge_learning_jobs
    (company_id, source_type, source_id, source_fingerprint, priority, status, available_at)
  values (p_company_id, 'manual', p_company_id,
    encode(digest(p_company_id::text || ':' || clock_timestamp()::text, 'sha256'), 'hex'), 90, 'pending', now())
  on conflict (source_type, source_id) do update set
    company_id = excluded.company_id, source_fingerprint = excluded.source_fingerprint,
    priority = greatest(knowledge_learning_jobs.priority, excluded.priority), status = 'pending', attempts = 0,
    available_at = now(), locked_at = null, lease_expires_at = null, worker_id = null, last_error = null
  returning id into job_id;
  return job_id;
end;
$$;

create or replace function public.knowledge_claim_learning_jobs(
  p_worker_id text, p_batch_size integer default 32, p_lease_seconds integer default 900, p_daily_limit integer default 48
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  claimed jsonb := '[]'::jsonb; completed_today integer := 0;
  bounded_batch integer := greatest(1, least(coalesce(p_batch_size, 32), 128));
  bounded_lease integer := greatest(60, least(coalesce(p_lease_seconds, 900), 3600));
  bounded_daily integer := greatest(1, least(coalesce(p_daily_limit, 48), 1000));
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then raise exception 'Service role required'; end if;
  select count(*)::integer into completed_today from public.knowledge_learning_runs
    where status in ('completed', 'partial') and started_at >= date_trunc('day', now());
  if completed_today >= bounded_daily then
    return jsonb_build_object('status', 'budget_exhausted', 'workerId', p_worker_id,
      'dailyLimit', bounded_daily, 'completedToday', completed_today, 'jobs', '[]'::jsonb);
  end if;
  with candidates as (
    select id from public.knowledge_learning_jobs
    where attempts < max_attempts and available_at <= now()
      and (status in ('pending', 'failed') or (status = 'processing' and coalesce(lease_expires_at, '-infinity'::timestamptz) <= now()))
    order by priority desc, created_at limit bounded_batch for update skip locked
  ), claimed_rows as (
    update public.knowledge_learning_jobs job set status = 'processing', attempts = job.attempts + 1,
      locked_at = now(), lease_expires_at = now() + make_interval(secs => bounded_lease),
      worker_id = left(coalesce(p_worker_id, 'knowledge-worker'), 160), last_error = null
    from candidates where job.id = candidates.id returning job.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('jobId', id, 'companyId', company_id, 'sourceType', source_type,
    'sourceId', source_id, 'sourceFingerprint', source_fingerprint, 'priority', priority,
    'attempt', attempts, 'maxAttempts', max_attempts) order by priority desc, created_at), '[]'::jsonb)
  into claimed from claimed_rows;
  return jsonb_build_object('status', case when jsonb_array_length(claimed) > 0 then 'claimed' else 'empty' end,
    'workerId', p_worker_id, 'dailyLimit', bounded_daily, 'completedToday', completed_today, 'jobs', claimed);
end;
$$;

create or replace function public.knowledge_learning_context(p_company_id uuid, p_job_ids uuid[] default '{}'::uuid[])
returns jsonb language sql security invoker stable set search_path = public as $$
  select case when coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
    then jsonb_build_object('error', 'service_role_required')
    else jsonb_build_object(
      'company', jsonb_build_object('id', c.id, 'name', coalesce(c.trade_name, c.legal_name), 'legalName', c.legal_name,
        'cnpj', c.cnpj, 'sector', coalesce(c.sector, c.segment), 'subSector', coalesce(c.sub_sector, c.subsegment),
        'stage', c.stage, 'description', c.description, 'creditProduct', c.credit_product,
        'hasReceivables', c.has_receivables, 'hasFidc', c.has_fidc, 'hasStructuredDebt', c.has_structured_debt,
        'fundingGap', c.funding_gap, 'fitFidc', c.fit_fidc, 'fitDcm', c.fit_dcm,
        'currentFundingStructure', c.current_funding_structure),
      'jobs', coalesce((select jsonb_agg(jsonb_build_object('id', j.id, 'sourceType', j.source_type,
        'sourceId', j.source_id, 'sourceFingerprint', j.source_fingerprint, 'priority', j.priority)
        order by j.priority desc, j.created_at) from public.knowledge_learning_jobs j
        where j.id = any(coalesce(p_job_ids, '{}'::uuid[])) and j.company_id = c.id), '[]'::jsonb),
      'monitoringOutputs', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'type', m.output_type,
        'title', m.title, 'summary', left(coalesce(m.summary, m.raw_text, ''), 6000), 'url', m.url,
        'observedAt', m.observed_at, 'status', m.status, 'connectorStatus', m.connector_status,
        'confidence', public.normalize_knowledge_learning_confidence(coalesce(m.confidence_score, m.source_confidence, 0)),
        'nature', m.observed_vs_inferred, 'sourceId', m.source_id) order by m.observed_at desc)
        from (select * from public.monitoring_outputs where company_id = c.id order by observed_at desc limit 24) m), '[]'::jsonb),
      'signals', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'type', s.signal_type,
        'label', s.signal_label, 'evidence', left(coalesce(s.evidence_text, ''), 5000), 'url', s.evidence_url,
        'observedAt', s.observed_at,
        'confidence', public.normalize_knowledge_learning_confidence(coalesce(s.confidence_score, s.confidence, 0)),
        'strength', public.normalize_knowledge_learning_confidence(coalesce(s.signal_strength, s.strength, 0)),
        'explicit', s.is_explicit, 'nature', s.observed_vs_inferred) order by s.observed_at desc, s.strength desc)
        from (select * from public.company_signals where company_id = c.id order by observed_at desc, strength desc limit 24) s), '[]'::jsonb),
      'qualification', (select jsonb_build_object('id', q.id,
        'totalScore', coalesce(q.qualification_score_total, q.total_score),
        'fundingNeedScore', q.predicted_funding_need_score, 'urgencyScore', coalesce(q.urgency_score, q.timing_score),
        'suggestedStructure', q.suggested_structure_type,
        'capitalStructureRationale', coalesce(q.capital_structure_rationale, q.rationale_summary, q.rationale),
        'fundingGapLevel', q.funding_gap_level, 'fitFidc', q.fit_fidc, 'fitDcm', q.fit_dcm,
        'nextAction', q.next_action, 'sourceConfidence', coalesce(q.source_confidence_score, q.confidence_score),
        'createdAt', q.created_at) from public.qualification_snapshots q
        where q.company_id = c.id order by q.created_at desc limit 1),
      'patterns', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name,
        'family', p.family, 'confidence', p.confidence, 'rationale', p.rationale,
        'thesisImpact', p.thesis_impact, 'detectedAt', p.detected_at) order by p.confidence desc, p.detected_at desc)
        from (select cp.id, pc.code, coalesce(pc.pattern_name, pc.name) as name,
          coalesce(pc.pattern_family, pc.category) as family,
          public.normalize_knowledge_learning_confidence(coalesce(cp.confidence_score, cp.confidence, 0)) as confidence,
          cp.rationale, cp.thesis_impact, cp.detected_at
          from public.company_patterns cp join public.pattern_catalog pc on pc.id = cp.pattern_id
          where cp.company_id = c.id order by coalesce(cp.confidence_score, cp.confidence, 0) desc, cp.detected_at desc limit 12) p), '[]'::jsonb),
      'existingKnowledge', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title,
        'nodeType', n.node_type, 'excerpt', n.excerpt, 'content', left(n.content_markdown, 8000),
        'tags', to_jsonb(n.tags), 'properties', n.properties, 'updatedAt', n.updated_at) order by n.updated_at desc)
        from (select * from public.knowledge_nodes where company_id = c.id and status = 'active'
          order by updated_at desc limit 32) n), '[]'::jsonb)
    ) end from public.companies c where c.id = p_company_id;
$$;

create or replace function public.knowledge_start_learning_run(
  p_company_id uuid, p_worker_id text, p_model text, p_job_ids uuid[], p_input_hash text,
  p_prompt_hash text, p_context_snapshot jsonb, p_deployment jsonb default '{}'::jsonb
) returns uuid language plpgsql security invoker set search_path = public as $$
declare run_id uuid;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then raise exception 'Service role required'; end if;
  insert into public.knowledge_learning_runs
    (company_id, worker_id, model, status, job_ids, input_hash, prompt_hash, context_snapshot, deployment)
  values (p_company_id, left(p_worker_id, 160), left(p_model, 200), 'processing', coalesce(p_job_ids, '{}'::uuid[]),
    left(p_input_hash, 128), left(p_prompt_hash, 128), coalesce(p_context_snapshot, '{}'::jsonb), coalesce(p_deployment, '{}'::jsonb))
  returning id into run_id;
  return run_id;
end;
$$;

create or replace function public.validate_knowledge_reference()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  node_company_id uuid;
  request_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  system_actor constant uuid := '11111111-1111-4111-8111-111111111111'::uuid;
begin
  if auth.uid() is null and request_role <> 'service_role' then raise exception 'Authentication required'; end if;
  if request_role = 'service_role' then new.created_by := system_actor;
  else
    if new.created_by is null then new.created_by := auth.uid(); end if;
    if new.created_by <> auth.uid() then raise exception 'created_by must match authenticated user'; end if;
  end if;
  select company_id into node_company_id from public.knowledge_nodes where id = new.node_id and status = 'active';
  if not found then raise exception 'Knowledge node not found or not visible: %', new.node_id; end if;
  if node_company_id is null or node_company_id is distinct from new.company_id then raise exception 'Knowledge reference company must match node company'; end if;
  case new.reference_type
    when 'company_signal' then if not exists (select 1 from public.company_signals where id = new.reference_id and company_id = new.company_id) then raise exception 'Company signal reference is invalid'; end if;
    when 'monitoring_output' then if not exists (select 1 from public.monitoring_outputs where id = new.reference_id and company_id = new.company_id) then raise exception 'Monitoring output reference is invalid'; end if;
    when 'qualification_snapshot' then if not exists (select 1 from public.qualification_snapshots where id = new.reference_id and company_id = new.company_id) then raise exception 'Qualification snapshot reference is invalid'; end if;
    when 'pipeline' then if not exists (select 1 from public.pipeline where id = new.reference_id and company_id = new.company_id) then raise exception 'Pipeline reference is invalid'; end if;
    when 'activity' then if not exists (select 1 from public.activities where id = new.reference_id and company_id = new.company_id) then raise exception 'Activity reference is invalid'; end if;
    when 'task' then if not exists (select 1 from public.tasks where id = new.reference_id and company_id = new.company_id) then raise exception 'Task reference is invalid'; end if;
    else raise exception 'Unsupported knowledge reference type: %', new.reference_type;
  end case;
  return new;
end;
$$;

create or replace function public.knowledge_agent_upsert_node(
  p_run_id uuid, p_company_id uuid, p_agent_key text, p_title text, p_node_type text,
  p_content_markdown text, p_excerpt text, p_tags text[], p_confidence numeric,
  p_input_hash text, p_evidence jsonb default '[]'::jsonb
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  system_actor constant uuid := '11111111-1111-4111-8111-111111111111'::uuid;
  node_id uuid; existing public.knowledge_nodes%rowtype; node_slug text; action text := 'unchanged';
  reference_item jsonb; reference_type text; reference_id uuid; references_applied integer := 0;
  clean_tags text[] := '{}'::text[]; properties_value jsonb;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if not exists (select 1 from public.knowledge_learning_runs where id = p_run_id and company_id = p_company_id and status = 'processing') then raise exception 'Learning run not active'; end if;
  if p_node_type not in ('note', 'company', 'thesis', 'signal', 'meeting', 'source', 'playbook', 'structure') then raise exception 'Invalid node type'; end if;
  if p_agent_key is null or p_agent_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$' then raise exception 'Invalid agent key'; end if;
  node_slug := public.knowledge_slugify('agent-' || replace(p_company_id::text, '-', '') || '-' || p_agent_key);
  select * into existing from public.knowledge_nodes where lower(slug) = lower(node_slug) limit 1;
  select coalesce(array_agg(tag_value order by tag_value), '{}'::text[]) into clean_tags
    from (select distinct lower(left(btrim(value), 50)) as tag_value
      from unnest(coalesce(p_tags, '{}'::text[]) || array['agent-managed', 'living-map']) as value
      where length(btrim(value)) > 0) normalized_tags;
  properties_value := jsonb_build_object('managedBy', 'knowledge-learning-agent-v1', 'agentManaged', true,
    'agentKey', p_agent_key, 'learningRunId', p_run_id, 'inputHash', left(coalesce(p_input_hash, ''), 128),
    'confidence', greatest(0, least(1, coalesce(p_confidence, 0))), 'scoreMutation', false, 'humanReviewRecommended', true);
  if existing.id is null then
    insert into public.knowledge_nodes
      (title, slug, node_type, content_markdown, excerpt, tags, properties, company_id, status, visibility, created_by, updated_by)
    values (left(btrim(p_title), 240), node_slug, p_node_type, coalesce(p_content_markdown, ''),
      left(coalesce(p_excerpt, ''), 500), clean_tags, properties_value, p_company_id,
      'active', 'team', system_actor, system_actor) returning id into node_id;
    action := 'created';
  else
    node_id := existing.id;
    if existing.company_id is distinct from p_company_id then raise exception 'Agent node company mismatch'; end if;
    if existing.content_markdown is distinct from coalesce(p_content_markdown, '')
       or existing.title is distinct from left(btrim(p_title), 240)
       or existing.node_type is distinct from p_node_type
       or existing.excerpt is distinct from left(coalesce(p_excerpt, ''), 500)
       or existing.tags is distinct from clean_tags
       or existing.properties is distinct from (existing.properties || properties_value) then
      update public.knowledge_nodes set title = left(btrim(p_title), 240), node_type = p_node_type,
        content_markdown = coalesce(p_content_markdown, ''), excerpt = left(coalesce(p_excerpt, ''), 500),
        tags = clean_tags, properties = existing.properties || properties_value,
        status = 'active', visibility = 'team', updated_by = system_actor where id = node_id;
      action := 'updated';
    end if;
  end if;
  for reference_item in select value from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) loop
    reference_type := reference_item->>'type';
    begin reference_id := (reference_item->>'id')::uuid; exception when others then continue; end;
    if reference_type not in ('company_signal', 'monitoring_output', 'qualification_snapshot') then continue; end if;
    insert into public.knowledge_references
      (node_id, company_id, reference_type, reference_id, label, snapshot, created_by)
    values (node_id, p_company_id, reference_type, reference_id,
      left(coalesce(reference_item->>'label', ''), 300), coalesce(reference_item->'snapshot', '{}'::jsonb), system_actor)
    on conflict (node_id, reference_type, reference_id) do update set label = excluded.label, snapshot = excluded.snapshot;
    references_applied := references_applied + 1;
  end loop;
  return jsonb_build_object('nodeId', node_id, 'agentKey', p_agent_key, 'action', action, 'referencesApplied', references_applied);
end;
$$;

create or replace function public.knowledge_agent_sync_links(p_run_id uuid, p_company_id uuid, p_links jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  system_actor constant uuid := '11111111-1111-4111-8111-111111111111'::uuid;
  link_item jsonb; source_id uuid; target_id uuid; target_title text; target_slug text;
  relation_type text; applied integer := 0;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if not exists (select 1 from public.knowledge_learning_runs where id = p_run_id and company_id = p_company_id and status = 'processing') then raise exception 'Learning run not active'; end if;
  delete from public.knowledge_links l using public.knowledge_nodes source
    where l.source_node_id = source.id and source.company_id = p_company_id
      and l.properties->>'managedBy' = 'knowledge-learning-agent-v1';
  for link_item in select value from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) loop
    relation_type := coalesce(link_item->>'relationType', 'related');
    if relation_type not in ('supports', 'challenges', 'related', 'evidence', 'thesis', 'signal') then relation_type := 'related'; end if;
    select id into source_id from public.knowledge_nodes where company_id = p_company_id and status = 'active'
      and properties->>'managedBy' = 'knowledge-learning-agent-v1' and properties->>'agentKey' = link_item->>'fromKey'
      order by updated_at desc limit 1;
    select id, title, slug into target_id, target_title, target_slug from public.knowledge_nodes
      where company_id = p_company_id and status = 'active' and properties->>'managedBy' = 'knowledge-learning-agent-v1'
        and properties->>'agentKey' = link_item->>'toKey' order by updated_at desc limit 1;
    if source_id is null or target_id is null or source_id = target_id then continue; end if;
    insert into public.knowledge_links
      (source_node_id, target_node_id, target_title, target_slug, relation_type, properties, created_by)
    values (source_id, target_id, target_title, target_slug, relation_type,
      jsonb_build_object('managedBy', 'knowledge-learning-agent-v1', 'learningRunId', p_run_id,
        'companyId', p_company_id, 'confidence', greatest(0, least(1, case
          when coalesce(link_item->>'confidence', '') ~ '^-?[0-9]+(?:\.[0-9]+)?$' then (link_item->>'confidence')::numeric else 0 end)),
        'rationale', left(coalesce(link_item->>'rationale', ''), 1000)), system_actor)
    on conflict (source_node_id, target_slug, relation_type) do update set
      target_node_id = excluded.target_node_id, target_title = excluded.target_title, properties = excluded.properties;
    applied := applied + 1;
  end loop;
  return jsonb_build_object('linksApplied', applied);
end;
$$;

create or replace function public.knowledge_finish_learning_run(
  p_run_id uuid, p_worker_id text, p_job_ids uuid[], p_result jsonb, p_usage jsonb,
  p_nodes_created integer, p_nodes_updated integer, p_links_applied integer, p_references_applied integer
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare completed_jobs integer;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then raise exception 'Service role required'; end if;
  update public.knowledge_learning_runs set status = 'completed', result_json = coalesce(p_result, '{}'::jsonb),
    usage_json = coalesce(p_usage, '{}'::jsonb), nodes_created = greatest(0, coalesce(p_nodes_created, 0)),
    nodes_updated = greatest(0, coalesce(p_nodes_updated, 0)), links_applied = greatest(0, coalesce(p_links_applied, 0)),
    references_applied = greatest(0, coalesce(p_references_applied, 0)), finished_at = now(), error = null
  where id = p_run_id and worker_id = left(p_worker_id, 160) and status = 'processing';
  if not found then raise exception 'Learning run not active for worker'; end if;
  update public.knowledge_learning_jobs set status = 'completed', lease_expires_at = null, locked_at = null,
    worker_id = null, last_error = null where id = any(coalesce(p_job_ids, '{}'::uuid[]))
      and worker_id = left(p_worker_id, 160) and status = 'processing';
  get diagnostics completed_jobs = row_count;
  return jsonb_build_object('status', 'completed', 'runId', p_run_id, 'jobsCompleted', completed_jobs);
end;
$$;

create or replace function public.knowledge_fail_learning_run(
  p_run_id uuid, p_worker_id text, p_job_ids uuid[], p_error text, p_retry_after_seconds integer default 900
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare failed_jobs integer; dead_jobs integer;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then raise exception 'Service role required'; end if;
  update public.knowledge_learning_runs set status = 'failed', error = left(coalesce(p_error, 'unknown error'), 5000),
    finished_at = now() where id = p_run_id and worker_id = left(p_worker_id, 160) and status = 'processing';
  update public.knowledge_learning_jobs set status = case when attempts >= max_attempts then 'dead_letter' else 'failed' end,
    available_at = case when attempts >= max_attempts then available_at else now() + make_interval(secs => greatest(60, least(coalesce(p_retry_after_seconds, 900), 86400))) end,
    lease_expires_at = null, locked_at = null, worker_id = null, last_error = left(coalesce(p_error, 'unknown error'), 5000)
  where id = any(coalesce(p_job_ids, '{}'::uuid[])) and worker_id = left(p_worker_id, 160) and status = 'processing';
  get diagnostics failed_jobs = row_count;
  select count(*)::integer into dead_jobs from public.knowledge_learning_jobs
    where id = any(coalesce(p_job_ids, '{}'::uuid[])) and status = 'dead_letter';
  return jsonb_build_object('status', 'failed', 'runId', p_run_id, 'jobsReleased', failed_jobs, 'deadLetters', dead_jobs);
end;
$$;

create or replace function public.knowledge_learning_status(p_company_id uuid default null)
returns jsonb language sql security invoker stable set search_path = public as $$
  select jsonb_build_object(
    'queue', jsonb_build_object('pending', count(*) filter (where j.status = 'pending'),
      'processing', count(*) filter (where j.status = 'processing'), 'failed', count(*) filter (where j.status = 'failed'),
      'deadLetter', count(*) filter (where j.status = 'dead_letter'), 'completed', count(*) filter (where j.status = 'completed')),
    'completedToday', (select count(*) from public.knowledge_learning_runs r
      where r.status in ('completed', 'partial') and r.started_at >= date_trunc('day', now())
        and (p_company_id is null or r.company_id = p_company_id)),
    'lastRun', (select jsonb_build_object('id', r.id, 'companyId', r.company_id,
      'companyName', coalesce(c.trade_name, c.legal_name), 'status', r.status, 'model', r.model,
      'nodesCreated', r.nodes_created, 'nodesUpdated', r.nodes_updated, 'linksApplied', r.links_applied,
      'referencesApplied', r.references_applied, 'startedAt', r.started_at, 'finishedAt', r.finished_at, 'error', r.error)
      from public.knowledge_learning_runs r join public.companies c on c.id = r.company_id
      where p_company_id is null or r.company_id = p_company_id order by r.started_at desc limit 1),
    'recentRuns', coalesce((select jsonb_agg(row_data order by started_at desc) from (
      select jsonb_build_object('id', r.id, 'companyId', r.company_id,
        'companyName', coalesce(c.trade_name, c.legal_name), 'status', r.status, 'model', r.model,
        'nodesCreated', r.nodes_created, 'nodesUpdated', r.nodes_updated, 'linksApplied', r.links_applied,
        'referencesApplied', r.references_applied, 'startedAt', r.started_at, 'finishedAt', r.finished_at, 'error', r.error) as row_data,
        r.started_at from public.knowledge_learning_runs r join public.companies c on c.id = r.company_id
      where p_company_id is null or r.company_id = p_company_id order by r.started_at desc limit 12) recent), '[]'::jsonb)
  ) from public.knowledge_learning_jobs j where p_company_id is null or j.company_id = p_company_id;
$$;

revoke all on function public.knowledge_enqueue_company_learning(uuid) from public, anon;
grant execute on function public.knowledge_enqueue_company_learning(uuid) to authenticated;
revoke all on function public.knowledge_claim_learning_jobs(text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.knowledge_learning_context(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.knowledge_start_learning_run(uuid, text, text, uuid[], text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.knowledge_agent_upsert_node(uuid, uuid, text, text, text, text, text, text[], numeric, text, jsonb) from public, anon, authenticated;
revoke all on function public.knowledge_agent_sync_links(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.knowledge_finish_learning_run(uuid, text, uuid[], jsonb, jsonb, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.knowledge_fail_learning_run(uuid, text, uuid[], text, integer) from public, anon, authenticated;
grant execute on function public.knowledge_claim_learning_jobs(text, integer, integer, integer) to service_role;
grant execute on function public.knowledge_learning_context(uuid, uuid[]) to service_role;
grant execute on function public.knowledge_start_learning_run(uuid, text, text, uuid[], text, text, jsonb, jsonb) to service_role;
grant execute on function public.knowledge_agent_upsert_node(uuid, uuid, text, text, text, text, text, text[], numeric, text, jsonb) to service_role;
grant execute on function public.knowledge_agent_sync_links(uuid, uuid, jsonb) to service_role;
grant execute on function public.knowledge_finish_learning_run(uuid, text, uuid[], jsonb, jsonb, integer, integer, integer, integer) to service_role;
grant execute on function public.knowledge_fail_learning_run(uuid, text, uuid[], text, integer) to service_role;
grant execute on function public.knowledge_learning_status(uuid) to authenticated, service_role;
revoke all on function public.enqueue_knowledge_learning_from_monitoring_output() from public, anon, authenticated;
revoke all on function public.enqueue_knowledge_learning_from_company_signal() from public, anon, authenticated;
