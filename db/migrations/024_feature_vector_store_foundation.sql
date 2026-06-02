-- Frente D — D6 feature store + vector store foundation
-- Keeps all analytical features and Copilot/RAG context inside Supabase/Postgres.

create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists public.feature_definitions (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null unique,
  feature_name text not null,
  feature_group text not null,
  value_type text not null default 'numeric',
  description text,
  entity_type text not null default 'company',
  source_policy jsonb not null default '{}'::jsonb,
  calculation_policy jsonb not null default '{}'::jsonb,
  freshness_sla_hours integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_feature_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  feature_key text not null references public.feature_definitions(feature_key) on delete cascade,
  feature_value_numeric numeric,
  feature_value_text text,
  feature_value_boolean boolean,
  feature_value_json jsonb not null default '{}'::jsonb,
  confidence numeric(5,2) not null default 0.50,
  evidence_url text,
  source_code text,
  source_document_id text,
  monitoring_output_id text,
  run_id uuid,
  payload_hash text,
  observed_at timestamptz not null default now(),
  captured_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique(company_id, feature_key, observed_at)
);

create index if not exists idx_company_feature_snapshots_company_feature
  on public.company_feature_snapshots(company_id, feature_key, observed_at desc);

create index if not exists idx_company_feature_snapshots_source_document
  on public.company_feature_snapshots(source_document_id);

create index if not exists idx_company_feature_snapshots_run
  on public.company_feature_snapshots(run_id);

create table if not exists public.company_feature_current (
  company_id text not null references public.companies(id) on delete cascade,
  feature_key text not null references public.feature_definitions(feature_key) on delete cascade,
  feature_value_numeric numeric,
  feature_value_text text,
  feature_value_boolean boolean,
  feature_value_json jsonb not null default '{}'::jsonb,
  confidence numeric(5,2) not null default 0.50,
  evidence_url text,
  source_code text,
  source_document_id text,
  monitoring_output_id text,
  run_id uuid,
  payload_hash text,
  observed_at timestamptz not null,
  captured_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key(company_id, feature_key)
);

create index if not exists idx_company_feature_current_feature
  on public.company_feature_current(feature_key, company_id);

create table if not exists public.copilot_context_documents (
  id uuid primary key default gen_random_uuid(),
  company_id text references public.companies(id) on delete cascade,
  source_document_id text,
  monitoring_output_id text,
  source_code text,
  context_type text not null,
  title text,
  content text not null,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  evidence_url text,
  payload_hash text,
  confidence numeric(5,2) not null default 0.50,
  observed_at timestamptz not null default now(),
  captured_at timestamptz not null default now(),
  embedding vector(1536),
  embedding_model text,
  embedding_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_copilot_context_documents_company
  on public.copilot_context_documents(company_id, observed_at desc);

create index if not exists idx_copilot_context_documents_source_document
  on public.copilot_context_documents(source_document_id);

create index if not exists idx_copilot_context_documents_status
  on public.copilot_context_documents(embedding_status, created_at desc);

create index if not exists idx_copilot_context_documents_embedding
  on public.copilot_context_documents using ivfflat (embedding vector_cosine_ops)
  with (lists = 100)
  where embedding is not null;

create or replace function public.upsert_company_feature_snapshot(
  p_company_id text,
  p_feature_key text,
  p_feature_value_numeric numeric default null,
  p_feature_value_text text default null,
  p_feature_value_boolean boolean default null,
  p_feature_value_json jsonb default '{}'::jsonb,
  p_confidence numeric default 0.50,
  p_evidence_url text default null,
  p_source_code text default null,
  p_source_document_id text default null,
  p_monitoring_output_id text default null,
  p_run_id uuid default null,
  p_payload_hash text default null,
  p_observed_at timestamptz default now()
)
returns uuid
language plpgsql
as $$
declare
  snapshot_id uuid;
  captured_timestamp timestamptz := now();
begin
  insert into public.company_feature_snapshots (
    company_id,
    feature_key,
    feature_value_numeric,
    feature_value_text,
    feature_value_boolean,
    feature_value_json,
    confidence,
    evidence_url,
    source_code,
    source_document_id,
    monitoring_output_id,
    run_id,
    payload_hash,
    observed_at,
    captured_at
  ) values (
    p_company_id,
    p_feature_key,
    p_feature_value_numeric,
    p_feature_value_text,
    p_feature_value_boolean,
    coalesce(p_feature_value_json, '{}'::jsonb),
    coalesce(p_confidence, 0.50),
    p_evidence_url,
    p_source_code,
    p_source_document_id,
    p_monitoring_output_id,
    p_run_id,
    p_payload_hash,
    coalesce(p_observed_at, now()),
    captured_timestamp
  )
  on conflict (company_id, feature_key, observed_at) do update set
    feature_value_numeric = excluded.feature_value_numeric,
    feature_value_text = excluded.feature_value_text,
    feature_value_boolean = excluded.feature_value_boolean,
    feature_value_json = excluded.feature_value_json,
    confidence = excluded.confidence,
    evidence_url = excluded.evidence_url,
    source_code = excluded.source_code,
    source_document_id = excluded.source_document_id,
    monitoring_output_id = excluded.monitoring_output_id,
    run_id = excluded.run_id,
    payload_hash = excluded.payload_hash,
    captured_at = excluded.captured_at
  returning id into snapshot_id;

  insert into public.company_feature_current (
    company_id,
    feature_key,
    feature_value_numeric,
    feature_value_text,
    feature_value_boolean,
    feature_value_json,
    confidence,
    evidence_url,
    source_code,
    source_document_id,
    monitoring_output_id,
    run_id,
    payload_hash,
    observed_at,
    captured_at,
    updated_at
  ) values (
    p_company_id,
    p_feature_key,
    p_feature_value_numeric,
    p_feature_value_text,
    p_feature_value_boolean,
    coalesce(p_feature_value_json, '{}'::jsonb),
    coalesce(p_confidence, 0.50),
    p_evidence_url,
    p_source_code,
    p_source_document_id,
    p_monitoring_output_id,
    p_run_id,
    p_payload_hash,
    coalesce(p_observed_at, now()),
    captured_timestamp,
    now()
  )
  on conflict (company_id, feature_key) do update set
    feature_value_numeric = excluded.feature_value_numeric,
    feature_value_text = excluded.feature_value_text,
    feature_value_boolean = excluded.feature_value_boolean,
    feature_value_json = excluded.feature_value_json,
    confidence = excluded.confidence,
    evidence_url = excluded.evidence_url,
    source_code = excluded.source_code,
    source_document_id = excluded.source_document_id,
    monitoring_output_id = excluded.monitoring_output_id,
    run_id = excluded.run_id,
    payload_hash = excluded.payload_hash,
    observed_at = excluded.observed_at,
    captured_at = excluded.captured_at,
    updated_at = now()
  where excluded.observed_at >= public.company_feature_current.observed_at;

  return snapshot_id;
end;
$$;

create or replace function public.build_copilot_context_from_source_document(p_source_document_id text)
returns uuid
language plpgsql
as $$
declare
  doc record;
  context_id uuid;
  content_text text;
begin
  select
    sd.*,
    coalesce(sc.metadata->>'code', sc.id::text, 'unknown') as source_code
  into doc
  from public.source_documents sd
  left join public.source_catalog sc
    on sc.id::text = sd.source_id::text
  where sd.id = p_source_document_id;

  if not found then
    raise exception 'source_document not found: %', p_source_document_id;
  end if;

  if coalesce(doc.quality_status, 'pending') <> 'passed' then
    raise exception 'source_document % is not quality approved: %', p_source_document_id, coalesce(doc.quality_status, 'pending');
  end if;

  content_text := concat_ws(E'\n\n',
    nullif(doc.title, ''),
    nullif(doc.normalized_payload->>'summary', ''),
    nullif(doc.normalized_payload->>'description', ''),
    left(coalesce(doc.raw_payload::text, ''), 8000)
  );

  insert into public.copilot_context_documents (
    company_id,
    source_document_id,
    source_code,
    context_type,
    title,
    content,
    summary,
    metadata,
    evidence_url,
    payload_hash,
    confidence,
    observed_at,
    captured_at,
    embedding_status
  ) values (
    doc.company_id,
    p_source_document_id,
    doc.source_code,
    doc.document_type,
    doc.title,
    content_text,
    nullif(doc.normalized_payload->>'summary', ''),
    jsonb_build_object(
      'document_type', doc.document_type,
      'external_id', doc.external_id,
      'extraction_status', doc.extraction_status,
      'quality_status', doc.quality_status
    ),
    coalesce(doc.evidence_url, doc.canonical_url),
    coalesce(doc.payload_hash, doc.content_hash),
    coalesce(doc.confidence, doc.confidence_score, 0.50),
    coalesce(doc.observed_at, doc.published_at, now()),
    coalesce(doc.captured_at, now()),
    'pending'
  )
  returning id into context_id;

  return context_id;
end;
$$;

create or replace function public.match_copilot_context_documents(
  query_embedding vector(1536),
  match_count integer default 10,
  filter_company_id text default null,
  min_confidence numeric default 0.00
)
returns table (
  id uuid,
  company_id text,
  source_document_id text,
  source_code text,
  context_type text,
  title text,
  content text,
  summary text,
  evidence_url text,
  confidence numeric,
  similarity float
)
language sql stable
as $$
  select
    ccd.id,
    ccd.company_id,
    ccd.source_document_id,
    ccd.source_code,
    ccd.context_type,
    ccd.title,
    ccd.content,
    ccd.summary,
    ccd.evidence_url,
    ccd.confidence,
    1 - (ccd.embedding <=> query_embedding) as similarity
  from public.copilot_context_documents ccd
  where ccd.embedding is not null
    and (filter_company_id is null or ccd.company_id = filter_company_id)
    and ccd.confidence >= min_confidence
  order by ccd.embedding <=> query_embedding
  limit greatest(coalesce(match_count, 10), 1)
$$;

insert into public.feature_definitions (
  feature_key,
  feature_name,
  feature_group,
  value_type,
  description,
  source_policy,
  calculation_policy,
  freshness_sla_hours
) values
  ('has_credit_product', 'Empresa possui produto de crédito', 'qualification', 'boolean', 'Indica se a empresa oferta crédito, antecipação, BNPL, capital de giro ou produto financeiro similar.', '{"allowed_layers":["silver","gold"],"requires_evidence":true}'::jsonb, '{"default_weight":"high","used_by":["qualification","lead_score","thesis"]}'::jsonb, 720),
  ('has_structurable_receivables', 'Recebíveis estruturáveis', 'qualification', 'boolean', 'Indica presença de recebíveis com potencial para cessão, securitização, FIDC ou estrutura similar.', '{"allowed_layers":["silver","gold"],"requires_evidence":true}'::jsonb, '{"default_weight":"high","used_by":["qualification","lead_score","thesis"]}'::jsonb, 720),
  ('funding_gap_score', 'Funding gap score', 'scoring', 'numeric', 'Score de 0 a 100 para pressão de funding inferida a partir de crescimento, produto de crédito, recebíveis e sinais públicos.', '{"allowed_layers":["gold"],"requires_evidence":true}'::jsonb, '{"scale":"0_100","used_by":["lead_score","ranking"]}'::jsonb, 168),
  ('fidc_fit_score', 'FIDC fit score', 'scoring', 'numeric', 'Score de 0 a 100 para aderência da empresa a uma estrutura FIDC.', '{"allowed_layers":["gold"],"requires_evidence":true}'::jsonb, '{"scale":"0_100","used_by":["lead_score","ranking","thesis"]}'::jsonb, 168),
  ('dcm_fit_score', 'DCM fit score', 'scoring', 'numeric', 'Score de 0 a 100 para aderência da empresa a instrumentos de DCM corporativo.', '{"allowed_layers":["gold"],"requires_evidence":true}'::jsonb, '{"scale":"0_100","used_by":["lead_score","ranking","thesis"]}'::jsonb, 168),
  ('latest_relevant_trigger_at', 'Último trigger relevante', 'monitoring', 'timestamp', 'Timestamp do último trigger que justifica abordagem comercial.', '{"allowed_layers":["silver","gold"],"requires_evidence":true}'::jsonb, '{"used_by":["ranking","pipeline_next_action"]}'::jsonb, 72),
  ('vc_backed_signal', 'Sinal de backing VC/PE', 'enrichment', 'boolean', 'Indica se há sinal público de investidor VC/PE relevante.', '{"allowed_layers":["silver","gold"],"requires_evidence":true}'::jsonb, '{"default_weight":"medium","used_by":["lead_score","qualification"]}'::jsonb, 2160)
on conflict (feature_key) do update set
  feature_name = excluded.feature_name,
  feature_group = excluded.feature_group,
  value_type = excluded.value_type,
  description = excluded.description,
  source_policy = excluded.source_policy,
  calculation_policy = excluded.calculation_policy,
  freshness_sla_hours = excluded.freshness_sla_hours,
  is_active = true,
  updated_at = now();
