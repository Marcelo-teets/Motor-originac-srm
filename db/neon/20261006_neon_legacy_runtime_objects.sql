-- Neon parity for runtime objects that existed only in the legacy (Supabase) live schema.
--
-- These objects were applied live through the dashboard/MCP and were never versioned
-- in db/migrations (or only as "mirror-only" lineage files on unmerged branches).
-- The backend writes to all of them, so on Neon every call failed with
-- "relation does not exist" / "column does not exist".
--
-- Sources used to reconstruct the shapes:
--   * ai_conversations / ai_messages / ai_agent_runs / vector_documents:
--     lineage mirror db/migrations/027_ai_layer_conversations_model.sql (commit 0caab2e8)
--     + 20260727123000_harden_user_owned_data_rls.sql (owner_user_id).
--   * bronze_historical_records: lineage mirror 035_historical_backfill_landing_layer.sql
--     (commit db49c3ba) + columns written by the public-data ingestion services.
--   * pipeline extra columns: written by captureDerivedSyncService/companyCreditReviewRuntime
--     and read by migrations 063/071/076/083/085.
--   * thesis_outputs / code_improvement_proposals: UUID shapes of 001/011.
--   * data_treatment_runs columns: 20260812053000_data_treatment_enrichment_v2.sql.
--
-- Additive and idempotent. No Supabase roles, auth schema writes, pg_cron or vault.

begin;

-- Deterministic uuid for legacy text source ids ('src_*'), identical to the
-- expression used by 20261001_neon_runtime_bootstrap_seed.sql. Used by the
-- migrator rewrite in scripts/lib/neon-sql-compat.mjs.
create or replace function private.legacy_source_uuid(p_code text)
returns uuid
language sql
immutable
strict
set search_path = pg_catalog
as $function$
  select (substr(md5(p_code), 1, 8) || '-' || substr(md5(p_code), 9, 4) || '-4' || substr(md5(p_code), 14, 3)
          || '-a' || substr(md5(p_code), 18, 3) || '-' || substr(md5(p_code), 21, 12))::uuid;
$function$;
revoke all on function private.legacy_source_uuid(text) from public;

-- Legacy live constraint used by "on conflict (name, url)" seeds (065+).
create unique index if not exists source_catalog_name_url_key
  on public.source_catalog (name, url);

-- AI conversation layer -----------------------------------------------------
create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_name text,
  owner_user_id uuid references public.user_profiles(id) on delete set null,
  context_type text,
  context_id uuid,
  title text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ai_conversations_context
  on public.ai_conversations (context_type, context_id, updated_at desc);
create index if not exists idx_ai_conversations_owner_user_updated
  on public.ai_conversations (owner_user_id, updated_at desc);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null,
  content text not null,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  model text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_messages_conversation_created
  on public.ai_messages (conversation_id, created_at desc);

create table if not exists public.ai_agent_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.ai_conversations(id) on delete cascade,
  context_type text,
  context_id uuid,
  agent_key text,
  plugins jsonb not null default '[]'::jsonb,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_agent_runs_conversation_created
  on public.ai_agent_runs (conversation_id, created_at desc);
create index if not exists idx_ai_agent_runs_agent_created
  on public.ai_agent_runs (agent_key, created_at desc);

-- Vector corpus (pgvector lives in schema public on Neon) -------------------
-- Live shape: 1024-dim Voyage embeddings (098_knowledge_embedding_coverage_v10,
-- api/knowledge-embedding-worker.ts) plus a stored Portuguese tsvector used by
-- 097_knowledge_hybrid_search_v9. content_tsv/build_pt_search_query and the
-- lexical/hybrid helpers were applied live without any versioned DDL.
create table if not exists public.vector_documents (
  id uuid primary key default gen_random_uuid(),
  company_id text,
  content text not null,
  embedding vector(1024),
  metadata jsonb not null default '{}'::jsonb,
  content_tsv tsvector generated always as (to_tsvector('portuguese', coalesce(content, ''))) stored,
  created_at timestamptz not null default now()
);
create index if not exists idx_vector_documents_company
  on public.vector_documents (company_id);
create index if not exists idx_vector_documents_content_tsv
  on public.vector_documents using gin (content_tsv);

create or replace function public.build_pt_search_query(p_query text)
returns tsquery
language sql
immutable
set search_path = public, pg_temp
as $function$
  select case
    when nullif(btrim(coalesce(p_query, '')), '') is null then null
    else websearch_to_tsquery('portuguese', btrim(p_query))
  end;
$function$;

-- Lexical retrieval used by backend/src/ai/vectorIndexService.ts. Never fabricates vectors.
create or replace function public.match_vector_documents_lexical(
  query_text text,
  match_count integer default 5,
  company_id text default null
)
returns table(id uuid, content text)
language sql
stable
set search_path = public, pg_temp
as $function$
  with q as (
    select public.build_pt_search_query(query_text) as tsq
  )
  select vd.id, vd.content
  from public.vector_documents vd
  cross join q
  where q.tsq is not null
    and vd.content_tsv @@ q.tsq
    and (match_vector_documents_lexical.company_id is null
         or vd.company_id::text = match_vector_documents_lexical.company_id)
  order by ts_rank(vd.content_tsv, q.tsq) desc, vd.created_at desc, vd.id
  limit least(greatest(coalesce(match_count, 5), 1), 50);
$function$;

-- Reciprocal-rank fusion of lexical + semantic candidates (signature granted by 097).
create or replace function public.match_vector_documents_hybrid(
  query_text text,
  query_embedding vector,
  match_count integer default 10,
  rrf_k integer default 60,
  company_id text default null
)
returns table(id uuid, content text)
language sql
stable
set search_path = public, pg_temp
as $function$
  with lexical as (
    select l.id, row_number() over (order by l.id) as rnk
    from public.match_vector_documents_lexical(query_text, greatest(coalesce(match_count, 10), 1) * 6, company_id) l
  ), semantic as (
    select vd.id, row_number() over (order by vd.embedding <=> query_embedding, vd.id) as rnk
    from public.vector_documents vd
    where query_embedding is not null
      and vd.embedding is not null
      and (match_vector_documents_hybrid.company_id is null
           or vd.company_id::text = match_vector_documents_hybrid.company_id)
    order by vd.embedding <=> query_embedding, vd.id
    limit greatest(coalesce(match_count, 10), 1) * 6
  ), fused as (
    select coalesce(l.id, s.id) as id,
           (coalesce(1.0 / (coalesce(rrf_k, 60) + l.rnk), 0.0)
            + coalesce(1.0 / (coalesce(rrf_k, 60) + s.rnk), 0.0))::double precision as rrf_score
    from lexical l
    full outer join semantic s on s.id = l.id
  )
  select vd.id, vd.content
  from fused f
  join public.vector_documents vd on vd.id = f.id
  order by f.rrf_score desc, vd.id
  limit least(greatest(coalesce(match_count, 10), 1), 50);
$function$;

-- Raw landing layer for public datasets ------------------------------------
create table if not exists public.bronze_historical_records (
  id uuid primary key default gen_random_uuid(),
  dataset_code text not null,
  record_key text not null,
  ref_date date not null,
  entity_cnpj text,
  payload jsonb not null default '{}'::jsonb,
  source_url text not null,
  content_hash text not null,
  ingested_at timestamptz not null default now(),
  unique (dataset_code, record_key)
);
create index if not exists bronze_historical_records_dataset_ref_idx
  on public.bronze_historical_records (dataset_code, ref_date desc);
create index if not exists bronze_historical_records_entity_ref_idx
  on public.bronze_historical_records (entity_cnpj, ref_date desc)
  where entity_cnpj is not null;

-- Heavy raw table: protect with the Neon growth circuit breaker (20261001).
do $$
begin
  if to_regprocedure('private.guard_heavy_table_growth()') is not null then
    drop trigger if exists trg_database_growth_guard_bronze_historical_records on public.bronze_historical_records;
    create trigger trg_database_growth_guard_bronze_historical_records
      before insert or update on public.bronze_historical_records
      for each row execute function private.guard_heavy_table_growth();
    drop trigger if exists trg_database_growth_guard_capital_market_events on public.capital_market_events;
    create trigger trg_database_growth_guard_capital_market_events
      before insert or update on public.capital_market_events
      for each row execute function private.guard_heavy_table_growth();
  end if;
end;
$$;

-- Company Master columns used by identity review/entity resolution (099-152) --
alter table public.companies
  add column if not exists normalized_name text,
  add column if not exists website_url text,
  add column if not exists country text,
  add column if not exists origin text,
  add column if not exists notes text,
  add column if not exists sector text,
  add column if not exists sub_sector text;

-- CRM columns written by the runtime and by migrations 063/071/085-094 -------
alter table public.pipeline
  add column if not exists status text not null default 'active',
  add column if not exists priority text,
  add column if not exists owner_name text,
  add column if not exists next_action_due_at timestamptz,
  add column if not exists expected_structure text,
  add column if not exists expected_ticket numeric;

alter table public.activities
  add column if not exists owner_name text,
  add column if not exists pipeline_id uuid references public.pipeline(id) on delete set null,
  add column if not exists occurred_at timestamptz not null default now();

alter table public.tasks
  add column if not exists owner_name text,
  add column if not exists pipeline_id uuid references public.pipeline(id) on delete set null;

-- Columns referenced by PL/pgSQL bodies (found with plpgsql_check on the replay).
alter table public.lead_score_snapshots
  add column if not exists priority_tier text,
  add column if not exists suggested_structure text,
  add column if not exists commercial_angle text;
alter table public.source_documents
  add column if not exists confidence numeric;
alter table public.monitoring_outputs
  add column if not exists search_profile_id text;
alter table public.tasks
  add column if not exists completed_at timestamptz;
alter table public.pipeline
  add column if not exists last_contact_at timestamptz;

-- qualification_snapshots columns written by captureDerivedSyncService and read by 141-143.
alter table public.qualification_snapshots
  add column if not exists snapshot_version text,
  add column if not exists receivables_structurable boolean,
  add column if not exists timing text,
  add column if not exists created_by text;

-- score_snapshots columns written by captureDerivedSyncService (and indexed by 20260727123300).
alter table public.score_snapshots
  add column if not exists score_version text,
  add column if not exists structural_need_score numeric,
  add column if not exists timing_score numeric,
  add column if not exists executability_score numeric,
  add column if not exists source_confidence_score numeric,
  add column if not exists trigger_strength_score numeric,
  add column if not exists drivers jsonb not null default '[]'::jsonb;

-- company_discovery_links: live shape from 046 (named unique constraint used by 151).
alter table public.company_discovery_links
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();
do $$
begin
  if exists (select 1 from pg_constraint
             where conrelid = 'public.company_discovery_links'::regclass
               and conname = 'company_discovery_links_company_id_discovered_candidate_id_key') then
    alter table public.company_discovery_links
      rename constraint company_discovery_links_company_id_discovered_candidate_id_key
      to company_discovery_links_company_candidate_unique;
  end if;
end;
$$;

-- Decision layers -------------------------------------------------------------
create table if not exists public.thesis_outputs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  thesis_summary text not null,
  structure_type text,
  market_map_summary text,
  confidence_score numeric(5,2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_thesis_outputs_company_created
  on public.thesis_outputs (company_id, created_at desc);

create table if not exists public.code_improvement_proposals (
  id uuid primary key default gen_random_uuid(),
  engine_name text not null,
  proposal_type text not null,
  title text not null,
  rationale text,
  target_module text,
  status text not null default 'draft',
  risk_level text not null default 'medium',
  proposal_payload jsonb not null default '{}'::jsonb,
  test_plan jsonb not null default '[]'::jsonb,
  branch_name text,
  pr_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_code_improvement_proposals_engine
  on public.code_improvement_proposals (engine_name, created_at desc);

-- Data treatment v2 (20260812053000) on top of the Neon core run table --------
alter table public.data_treatment_runs
  add column if not exists trigger_type text not null default 'manual',
  add column if not exists scope_type text not null default 'company',
  add column if not exists outputs_seen integer not null default 0,
  add column if not exists outputs_relevant integer not null default 0,
  add column if not exists outputs_decision_eligible integer not null default 0,
  add column if not exists signals_generated integer not null default 0,
  add column if not exists enrichments_generated integer not null default 0,
  add column if not exists average_relevance_score numeric(6,2) not null default 0,
  add column if not exists average_quality_score numeric(6,2) not null default 0;

-- Objects applied live from unmerged branches (lineage mirrors) ---------------
-- data_quality_violations: mirror 031_data_quality_gate_expansion.sql (commit 1a5bb2a0,
-- branch codex/data-platform-frente-d); used by 093/112 decision quality gates.
create table if not exists public.data_quality_violations (
  id uuid primary key default gen_random_uuid(),
  rule_code text not null,
  entity_table text not null,
  entity_id text not null,
  source_id uuid,
  severity text not null default 'medium',
  status text not null default 'open',
  reason text not null,
  observed_value jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists idx_data_quality_violations_open
  on public.data_quality_violations (entity_table, rule_code, detected_at desc)
  where resolved_at is null;
create index if not exists idx_data_quality_violations_source
  on public.data_quality_violations (source_id, detected_at desc)
  where source_id is not null;

-- normalize_cnpj_digits: mirror 029_company_entity_aliases_cnpj_backfill.sql (commit 1a5bb2a0);
-- used by the candidate identity gates (096+).
create or replace function public.normalize_cnpj_digits(p_cnpj text)
returns text
language sql
immutable
as $$
  select case
    when length(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g')) = 14
      then regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g')
    else null
  end;
$$;

-- notifications: legacy dashboard-only table, hardened by 20260727123000 (owner RLS).
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  owner_name text,
  title text,
  body text,
  notification_type text,
  is_read boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

commit;
