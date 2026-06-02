-- Frente D — Data Platform D0/D1 foundation
-- Adds source contracts, lineage fields, quality metadata, and a Brasil-only source catalog seed.
-- Defensive migration: compatible with source_catalog.id as text or uuid; metadata.code is the stable key.

create extension if not exists pgcrypto;

alter table if exists public.source_catalog
  add column if not exists source_tier integer,
  add column if not exists geography_scope text not null default 'BR',
  add column if not exists collection_method text,
  add column if not exists cadence text,
  add column if not exists priority_score integer not null default 50,
  add column if not exists reliability_score numeric(5,2) not null default 0.50,
  add column if not exists schema_contract jsonb not null default '{}'::jsonb,
  add column if not exists contract_version integer not null default 1,
  add column if not exists contract_status text not null default 'active',
  add column if not exists freshness_sla_hours integer,
  add column if not exists pii_classification text not null default 'none',
  add column if not exists cost_policy jsonb not null default '{}'::jsonb,
  add column if not exists drift_policy jsonb not null default '{}'::jsonb;

create unique index if not exists uq_source_catalog_metadata_code
  on public.source_catalog ((metadata->>'code'))
  where metadata ? 'code';

create table if not exists public.source_schema_versions (
  id uuid primary key default gen_random_uuid(),
  source_code text not null,
  contract_version integer not null,
  schema_contract jsonb not null,
  expected_payload_hash_fields text[] not null default array['canonical_url', 'title', 'published_at'],
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique(source_code, contract_version)
);
create index if not exists idx_source_schema_versions_source_status
  on public.source_schema_versions(source_code, status, contract_version desc);

create table if not exists public.data_quality_runs (
  id uuid primary key default gen_random_uuid(),
  source_code text,
  run_id uuid,
  scope text not null default 'source',
  status text not null default 'passed',
  rows_checked integer not null default 0,
  rows_failed integer not null default 0,
  completeness_score numeric(5,2),
  validity_score numeric(5,2),
  freshness_score numeric(5,2),
  consistency_score numeric(5,2),
  uniqueness_score numeric(5,2),
  drift_detected boolean not null default false,
  gate_result text not null default 'allow',
  failure_payload jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists idx_data_quality_runs_source_started
  on public.data_quality_runs(source_code, started_at desc);

create table if not exists public.source_health (
  source_code text primary key,
  source_name text not null,
  source_tier integer,
  health_status text not null default 'unknown',
  reliability_score numeric(5,2) not null default 0.50,
  freshness_sla_hours integer,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  consecutive_failures integer not null default 0,
  last_drift_detected_at timestamptz,
  average_latency_ms integer,
  yield_signals_per_run numeric(10,2),
  cost_units_last_30d numeric(12,2) not null default 0,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists public.source_quarantine (
  id uuid primary key default gen_random_uuid(),
  source_code text,
  run_id uuid,
  source_document_id text,
  reason text not null,
  severity text not null default 'medium',
  raw_payload jsonb not null default '{}'::jsonb,
  gate_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists idx_source_quarantine_source_created
  on public.source_quarantine(source_code, created_at desc);

-- Lineage columns for silver/gold tables. These are additive and do not change runtime behavior.
do $$
declare
  t text;
begin
  foreach t in array array[
    'monitoring_outputs',
    'company_signals',
    'enrichments',
    'qualification_snapshots',
    'lead_score_snapshots',
    'thesis_outputs',
    'ranking_v2',
    'company_patterns',
    'vector_documents'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I add column if not exists run_id uuid', t);
      execute format('alter table public.%I add column if not exists captured_at timestamptz not null default now()', t);
      execute format('alter table public.%I add column if not exists confidence numeric(5,2)', t);
      execute format('alter table public.%I add column if not exists evidence_url text', t);
      execute format('alter table public.%I add column if not exists payload_hash text', t);
      execute format('alter table public.%I add column if not exists source_document_id text', t);
    end if;
  end loop;
end $$;

alter table if exists public.source_documents
  add column if not exists captured_at timestamptz not null default now(),
  add column if not exists payload_hash text,
  add column if not exists evidence_url text,
  add column if not exists contract_version integer not null default 1,
  add column if not exists quality_status text not null default 'pending',
  add column if not exists quarantine_reason text;

create index if not exists idx_source_documents_payload_hash
  on public.source_documents(payload_hash)
  where payload_hash is not null;

-- Institutional Brasil-only source catalog seed for D1.
do $$
declare
  r record;
  id_type text;
begin
  select data_type into id_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'source_catalog'
    and column_name = 'id';

  create temp table if not exists tmp_data_platform_sources (
    code text primary key,
    name text not null,
    source_type text not null,
    category text not null,
    auth_requirement text,
    status text not null,
    source_tier integer not null,
    collection_method text not null,
    cadence text not null,
    priority_score integer not null,
    reliability_score numeric(5,2) not null,
    freshness_sla_hours integer,
    pii_classification text not null,
    schema_contract jsonb not null,
    cost_policy jsonb not null,
    drift_policy jsonb not null,
    rate_limit_notes text
  ) on commit drop;

  insert into tmp_data_platform_sources values
    ('src_cvm_dados_abertos', 'CVM Dados Abertos', 'dataset_api', 'regulatory_market', 'none', 'real', 1, 'batch_download', 'daily', 95, 0.95, 24, 'none', '{"required":["document_type","reference_date","issuer_or_fund_name","canonical_url"],"optional":["cnpj","administrator","manager","asset_class"],"drift_checks":["required_fields","file_layout"]}'::jsonb, '{"cost":"free","quota":"public"}'::jsonb, '{"on_schema_change":"quarantine","notify":"source_governance"}'::jsonb, 'Official public datasets; batch ingestion preferred.'),
    ('src_cvm_fidc_informes', 'CVM FIDC Informes', 'dataset_api', 'fidc_regulatory', 'none', 'real', 1, 'batch_download', 'daily', 100, 0.97, 24, 'none', '{"required":["fund_cnpj","fund_name","reference_date","report_type","document_url"],"optional":["administrator","manager","quota_class","pl","subordination"],"signals":["existing_fidc","fidc_activity","asset_backing"]}'::jsonb, '{"cost":"free","quota":"public"}'::jsonb, '{"on_schema_change":"quarantine","notify":"source_governance"}'::jsonb, 'High priority for FIDC fit and existing securitization detection.'),
    ('src_b3_renda_fixa', 'B3 Renda Fixa e Valores Mobiliarios', 'dataset_api', 'regulatory_market', 'none_or_registration', 'planned', 1, 'batch_or_api', 'daily', 90, 0.92, 24, 'none', '{"required":["instrument_type","issuer_name","reference_date"],"optional":["issuer_cnpj","isin","series","maturity","indexer","volume"],"signals":["existing_debt_market_access","debenture_cri_cra_activity"]}'::jsonb, '{"cost":"free_or_low","quota":"check_access"}'::jsonb, '{"on_schema_change":"quarantine"}'::jsonb, 'Official market infrastructure source; access method to be confirmed per endpoint.'),
    ('src_anbima_debentures', 'ANBIMA Debentures e Mercado de Capitais', 'dataset_api', 'market_intelligence', 'none_or_registration', 'planned', 1, 'api_or_download', 'daily', 88, 0.90, 24, 'none', '{"required":["issuer_name","instrument_type","reference_date"],"optional":["issuer_cnpj","rating","taxa_indicativa","duration","indexer"],"signals":["debt_market_comparable","pricing_reference"]}'::jsonb, '{"cost":"free_or_low","quota":"check_access"}'::jsonb, '{"on_schema_change":"quarantine"}'::jsonb, 'Use for DCM comparables and pricing context.'),
    ('src_bcb_sgs', 'Banco Central SGS Macro Series', 'api', 'macro_context', 'none', 'real', 1, 'api', 'daily', 75, 0.95, 24, 'none', '{"required":["series_code","reference_date","value"],"optional":["series_name","unit"],"signals":["macro_indexer_context"]}'::jsonb, '{"cost":"free","quota":"public"}'::jsonb, '{"on_schema_change":"alert"}'::jsonb, 'Macro context for Selic, IPCA, FX and credit indexers.'),
    ('src_receita_cnpj_open_data', 'Receita Federal CNPJ Dados Abertos', 'dataset_api', 'company_registry', 'none', 'planned', 4, 'batch_download', 'monthly', 92, 0.95, 720, 'qsa_pii', '{"required":["cnpj","legal_name","status","cnae","opening_date"],"optional":["trade_name","capital_social","qsa","address"],"signals":["entity_resolution","registry_status","company_age"]}'::jsonb, '{"cost":"free","quota":"public"}'::jsonb, '{"on_schema_change":"quarantine"}'::jsonb, 'Canonical CNPJ registry; CPF/QSA fields must be minimized and masked.'),
    ('src_brasilapi_cnpj', 'BrasilAPI CNPJ', 'api', 'company_registry', 'none', 'real', 4, 'api', 'on_demand', 80, 0.82, 168, 'qsa_pii', '{"required":["cnpj","razao_social","descricao_situacao_cadastral"],"optional":["nome_fantasia","cnae_fiscal","qsa","municipio","uf"],"signals":["entity_resolution","registry_status"]}'::jsonb, '{"cost":"free","quota":"public_fair_use"}'::jsonb, '{"on_schema_change":"alert"}'::jsonb, 'Runtime fallback for CNPJ enrichment.'),
    ('src_registradoras_recebiveis_authorized', 'Registradoras de Recebiveis Autorizadas', 'authorized_api', 'receivables_credit', 'client_authorization', 'planned', 2, 'authorized_api', 'on_demand', 100, 0.90, 24, 'business_sensitive', '{"required":["cnpj","reference_date","receivable_type","registered_amount"],"optional":["registry","debtor_concentration","maturity_profile"],"signals":["receivables_depth","fidc_asset_backing","funding_gap"]}'::jsonb, '{"cost":"paid_or_partner","quota":"contractual"}'::jsonb, '{"on_schema_change":"quarantine","requires_authorization":true}'::jsonb, 'Only with legal/contractual authorization; core FIDC asset source.'),
    ('src_bcb_scr_authorized', 'Banco Central SCR Autorizado', 'authorized_api', 'credit_bureau_authorized', 'client_authorization', 'planned', 2, 'authorized_api', 'on_demand', 95, 0.92, 24, 'financial_sensitive', '{"required":["cnpj","reference_date","credit_exposure"],"optional":["risk_bucket","institution_count","modalities"],"signals":["leverage","existing_bank_debt","credit_capacity"]}'::jsonb, '{"cost":"regulated","quota":"authorized"}'::jsonb, '{"on_schema_change":"quarantine","requires_authorization":true}'::jsonb, 'Use only with borrower authorization.'),
    ('src_sefaz_nfe_authorized', 'SEFAZ NF-e Autorizada', 'authorized_api', 'revenue_receivables', 'client_authorization', 'planned', 2, 'authorized_api', 'on_demand', 92, 0.90, 24, 'tax_sensitive', '{"required":["cnpj","invoice_date","invoice_amount"],"optional":["buyer_cnpj","payment_terms","product_category"],"signals":["revenue_proxy","receivables_generation","debtor_concentration"]}'::jsonb, '{"cost":"state_dependent","quota":"authorized"}'::jsonb, '{"on_schema_change":"quarantine","requires_authorization":true}'::jsonb, 'Use only with explicit access authorization.'),
    ('src_cenprot_protestos', 'CENPROT Protestos', 'website_or_authorized_api', 'legal_risk', 'none_or_paid', 'planned', 3, 'api_or_scrape_last_resort', 'weekly', 85, 0.84, 168, 'legal_sensitive', '{"required":["cnpj","protest_status","reference_date"],"optional":["amount","notary_state","count"],"signals":["protest_red_flag","liquidity_stress"]}'::jsonb, '{"cost":"paid_or_public_lookup","quota":"respect_tos"}'::jsonb, '{"on_schema_change":"quarantine"}'::jsonb, 'Respect ToS; scraping only as last resort.'),
    ('src_pgfn_divida_ativa', 'PGFN Divida Ativa e Regularidade Fiscal', 'dataset_api', 'fiscal_risk', 'none', 'planned', 3, 'batch_download', 'weekly', 82, 0.90, 168, 'tax_sensitive', '{"required":["cnpj","reference_date","debt_status"],"optional":["amount","debt_type","regularity"],"signals":["tax_debt_red_flag","fiscal_stress"]}'::jsonb, '{"cost":"free","quota":"public"}'::jsonb, '{"on_schema_change":"quarantine"}'::jsonb, 'Fiscal risk gate for qualification.'),
    ('src_tst_cndt', 'TST CNDT Trabalhista', 'website_or_api', 'labor_legal_risk', 'none', 'planned', 3, 'api_or_scrape_last_resort', 'weekly', 78, 0.86, 168, 'legal_sensitive', '{"required":["cnpj","certificate_status","reference_date"],"optional":["certificate_url","expiration_date"],"signals":["labor_debt_red_flag"]}'::jsonb, '{"cost":"free","quota":"respect_tos"}'::jsonb, '{"on_schema_change":"quarantine"}'::jsonb, 'Labor debt red flag source.'),
    ('src_judicial_rj_monitor', 'Judicial RJ Falencia e Recuperacao', 'website_or_search', 'judicial_risk', 'none_or_paid', 'planned', 3, 'search_monitoring', 'daily', 90, 0.78, 24, 'legal_sensitive', '{"required":["company_name_or_cnpj","event_type","evidence_url","captured_at"],"optional":["court","case_number","amount"],"signals":["recovery_judicial_kill_switch","bankruptcy_kill_switch"]}'::jsonb, '{"cost":"free_or_paid","quota":"respect_tos"}'::jsonb, '{"on_schema_change":"quarantine"}'::jsonb, 'Kill-switch source for origination risk.'),
    ('src_diario_oficial', 'Diario Oficial Monitor', 'rss_or_search', 'legal_publication', 'none', 'planned', 3, 'rss_or_search', 'daily', 76, 0.80, 24, 'legal_sensitive', '{"required":["publication_date","title","evidence_url"],"optional":["cnpj","company_name","jurisdiction"],"signals":["legal_event","regulatory_event"]}'::jsonb, '{"cost":"free","quota":"public"}'::jsonb, '{"on_schema_change":"alert"}'::jsonb, 'Public legal events and notices.'),
    ('src_company_website_deep', 'Company Website Deep Monitor', 'website', 'company_site', 'none', 'real', 5, 'website_fetch', 'weekly', 88, 0.78, 168, 'none', '{"required":["url","captured_at","content_hash"],"optional":["title","extracted_text","changed_sections"],"signals":["product_credit_launch","receivables_language","expansion_signal"]}'::jsonb, '{"cost":"free","quota":"robots_tos"}'::jsonb, '{"on_schema_change":"alert","content_hash_required":true}'::jsonb, 'High weight because it captures company-controlled narrative.'),
    ('src_google_news_rss', 'Google News RSS Brasil', 'rss', 'news_niche', 'none', 'real', 5, 'rss', 'daily', 78, 0.65, 24, 'none', '{"required":["title","link","published_at"],"optional":["source","summary"],"signals":["funding_event","dcm_signal","expansion_news"]}'::jsonb, '{"cost":"free","quota":"public_fair_use"}'::jsonb, '{"on_schema_change":"alert"}'::jsonb, 'News is timing signal; must be corroborated before high-confidence gold.'),
    ('src_vc_portfolio_monitor', 'VC Portfolio Monitor Brasil', 'website', 'vc_portfolio', 'none', 'planned', 5, 'website_fetch', 'weekly', 84, 0.76, 168, 'none', '{"required":["fund_name","portfolio_company_name","evidence_url"],"optional":["domain","sector","stage"],"signals":["venture_backed","growth_cluster","portfolio_change"]}'::jsonb, '{"cost":"free","quota":"robots_tos"}'::jsonb, '{"on_schema_change":"alert"}'::jsonb, 'Strategic universe expansion for tech-backed companies.'),
    ('src_similarweb_mcp', 'SimilarWeb MCP', 'mcp_connector', 'commercial_alternative', 'connector_auth', 'available', 5, 'mcp', 'on_demand', 72, 0.62, 720, 'none', '{"required":["domain","captured_at"],"optional":["traffic_rank","visits","category"],"signals":["digital_traction_proxy"]}'::jsonb, '{"cost":"connector_dependent","quota":"monitor"}'::jsonb, '{"on_schema_change":"alert"}'::jsonb, 'Digital footprint enrichment, not a source of truth for credit alone.'),
    ('src_lusha_mcp', 'Lusha MCP', 'mcp_connector', 'abm_contacts', 'connector_auth', 'available', 5, 'mcp', 'on_demand', 70, 0.60, 720, 'contact_pii', '{"required":["company_name_or_domain","captured_at"],"optional":["contacts","firmographics"],"signals":["decision_maker_mapping","firmographic_validation"]}'::jsonb, '{"cost":"connector_dependent","quota":"monitor"}'::jsonb, '{"on_schema_change":"alert"}'::jsonb, 'ABM enrichment; PII minimization applies.'),
    ('src_apollo_mcp', 'Apollo MCP', 'mcp_connector', 'abm_contacts', 'connector_auth', 'available', 5, 'mcp', 'on_demand', 70, 0.60, 720, 'contact_pii', '{"required":["company_name_or_domain","captured_at"],"optional":["contacts","headcount","industry"],"signals":["decision_maker_mapping","headcount_proxy"]}'::jsonb, '{"cost":"connector_dependent","quota":"monitor"}'::jsonb, '{"on_schema_change":"alert"}'::jsonb, 'ABM enrichment; avoid personal/free emails in outreach exports.'),
    ('src_ai_vibe_prospecting_mcp', 'AI Vibe Prospecting MCP', 'mcp_connector', 'prospecting_enrichment', 'connector_auth', 'available', 5, 'mcp', 'on_demand', 74, 0.58, 720, 'contact_pii', '{"required":["query","captured_at"],"optional":["lead_matches","signals","contacts"],"signals":["lead_discovery","enrichment_candidate"]}'::jsonb, '{"cost":"connector_dependent","quota":"monitor"}'::jsonb, '{"on_schema_change":"alert"}'::jsonb, 'Lead discovery and enrichment candidate source.'),
    ('src_fireflies_mcp', 'Fireflies MCP', 'mcp_connector', 'post_call_intelligence', 'connector_auth', 'available', 5, 'mcp', 'post_call', 82, 0.70, 24, 'meeting_pii', '{"required":["meeting_id","captured_at","transcript_or_summary"],"optional":["participants","objections","next_steps"],"signals":["intent_signal","objection_signal","commercial_next_action"]}'::jsonb, '{"cost":"connector_dependent","quota":"monitor"}'::jsonb, '{"on_schema_change":"alert"}'::jsonb, 'Turns meetings into post-call origination signals.'),
    ('src_cb_insights_mcp', 'CB Insights MCP', 'mcp_connector', 'market_funding_intelligence', 'connector_auth', 'pending_auth', 5, 'mcp', 'on_demand', 68, 0.64, 720, 'none', '{"required":["company_name_or_domain","captured_at"],"optional":["funding_events","investors","market_tags"],"signals":["funding_history","market_validation"]}'::jsonb, '{"cost":"connector_dependent","quota":"monitor"}'::jsonb, '{"on_schema_change":"alert"}'::jsonb, 'Optional market intelligence connector; not central dependency.')
  on conflict (code) do nothing;

  for r in select * from tmp_data_platform_sources loop
    if exists (select 1 from public.source_catalog where metadata->>'code' = r.code) then
      update public.source_catalog
      set name = r.name,
          source_type = r.source_type,
          category = r.category,
          auth_requirement = r.auth_requirement,
          status = r.status,
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('code', r.code, 'sourceTier', r.source_tier, 'method', r.collection_method),
          rate_limit_notes = r.rate_limit_notes,
          health = case when r.status in ('real', 'available') then 'healthy' else 'planned' end,
          source_tier = r.source_tier,
          geography_scope = 'BR',
          collection_method = r.collection_method,
          cadence = r.cadence,
          priority_score = r.priority_score,
          reliability_score = r.reliability_score,
          schema_contract = r.schema_contract,
          contract_version = 1,
          contract_status = 'active',
          freshness_sla_hours = r.freshness_sla_hours,
          pii_classification = r.pii_classification,
          cost_policy = r.cost_policy,
          drift_policy = r.drift_policy,
          updated_at = now()
      where metadata->>'code' = r.code;
    else
      if id_type = 'uuid' then
        insert into public.source_catalog (
          name, source_type, category, auth_requirement, status, metadata, rate_limit_notes, health,
          source_tier, geography_scope, collection_method, cadence, priority_score, reliability_score,
          schema_contract, contract_version, contract_status, freshness_sla_hours, pii_classification,
          cost_policy, drift_policy
        ) values (
          r.name, r.source_type, r.category, r.auth_requirement, r.status,
          jsonb_build_object('code', r.code, 'sourceTier', r.source_tier, 'method', r.collection_method),
          r.rate_limit_notes, case when r.status in ('real', 'available') then 'healthy' else 'planned' end,
          r.source_tier, 'BR', r.collection_method, r.cadence, r.priority_score, r.reliability_score,
          r.schema_contract, 1, 'active', r.freshness_sla_hours, r.pii_classification, r.cost_policy, r.drift_policy
        );
      else
        insert into public.source_catalog (
          id, name, source_type, category, auth_requirement, status, metadata, rate_limit_notes, health,
          source_tier, geography_scope, collection_method, cadence, priority_score, reliability_score,
          schema_contract, contract_version, contract_status, freshness_sla_hours, pii_classification,
          cost_policy, drift_policy
        ) values (
          r.code, r.name, r.source_type, r.category, r.auth_requirement, r.status,
          jsonb_build_object('code', r.code, 'sourceTier', r.source_tier, 'method', r.collection_method),
          r.rate_limit_notes, case when r.status in ('real', 'available') then 'healthy' else 'planned' end,
          r.source_tier, 'BR', r.collection_method, r.cadence, r.priority_score, r.reliability_score,
          r.schema_contract, 1, 'active', r.freshness_sla_hours, r.pii_classification, r.cost_policy, r.drift_policy
        );
      end if;
    end if;

    insert into public.source_schema_versions (source_code, contract_version, schema_contract, status)
    values (r.code, 1, r.schema_contract, 'active')
    on conflict (source_code, contract_version) do update set
      schema_contract = excluded.schema_contract,
      status = excluded.status;

    insert into public.source_health (
      source_code, source_name, source_tier, health_status, reliability_score, freshness_sla_hours, notes, updated_at
    ) values (
      r.code, r.name, r.source_tier,
      case when r.status in ('real', 'available') then 'healthy' else 'planned' end,
      r.reliability_score, r.freshness_sla_hours, r.rate_limit_notes, now()
    )
    on conflict (source_code) do update set
      source_name = excluded.source_name,
      source_tier = excluded.source_tier,
      reliability_score = excluded.reliability_score,
      freshness_sla_hours = excluded.freshness_sla_hours,
      notes = excluded.notes,
      updated_at = now();
  end loop;
end $$;
