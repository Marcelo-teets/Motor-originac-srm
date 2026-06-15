-- 029_linkedin_media_source_expansion.sql
-- Expands origination data coverage with media/news sources and LinkedIn historical metrics.
-- Scope: Supabase/Postgres only. No parallel stack.

create table if not exists public.company_source_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  source_id text not null references public.source_catalog(id),
  metric_key text not null,
  metric_value numeric,
  metric_text text,
  metric_unit text,
  observed_at timestamptz not null default now(),
  period_start timestamptz,
  period_end timestamptz,
  confidence_score numeric(5,2) not null default 0.70,
  observed_vs_inferred text not null default 'observed',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(company_id, source_id, metric_key, observed_at)
);
create index if not exists idx_company_source_metric_snapshots_company on public.company_source_metric_snapshots(company_id, observed_at desc);
create index if not exists idx_company_source_metric_snapshots_source_metric on public.company_source_metric_snapshots(source_id, metric_key, observed_at desc);

create table if not exists public.company_linkedin_role_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  source_id text not null references public.source_catalog(id),
  linkedin_company_url text,
  role_family text not null,
  role_title text,
  employee_count integer,
  profile_sample_size integer,
  observed_at timestamptz not null default now(),
  confidence_score numeric(5,2) not null default 0.65,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_company_linkedin_role_snapshots_company on public.company_linkedin_role_snapshots(company_id, observed_at desc);
create index if not exists idx_company_linkedin_role_snapshots_role_family on public.company_linkedin_role_snapshots(role_family, observed_at desc);
create unique index if not exists uq_company_linkedin_role_snapshots_identity on public.company_linkedin_role_snapshots(company_id, source_id, role_family, coalesce(role_title, ''), observed_at);

insert into public.source_catalog (id, name, source_type, category, auth_requirement, status, metadata, rate_limit_notes, health)
values
  (
    'src_linkedin_company_page',
    'LinkedIn Company Page Metrics',
    'professional_network',
    'LinkedIn company intelligence',
    'official_api_or_manual_export',
    'partial',
    '{
      "code":"src_linkedin_company_page",
      "provider":"linkedin",
      "coverage":"company_page",
      "metricsTracked":["linkedin_company_url","employee_count","employee_count_range","followers_count","page_description","industry","headquarters","locations"],
      "historyTables":["company_source_metric_snapshots"],
      "captureMode":"official_api_or_operator_verified_snapshot",
      "cadence":"weekly",
      "compliance":"Do not scrape authenticated/private LinkedIn surfaces. Use official access, permitted exports, or manually verified public snapshots."
    }'::jsonb,
    'Use authorized API/export/manual verified snapshot. Weekly cadence by company; store only company/page level metrics and role-count aggregates.',
    'degraded'
  ),
  (
    'src_linkedin_credit_roles',
    'LinkedIn Credit & Risk Role Intelligence',
    'professional_network',
    'LinkedIn people intelligence',
    'official_api_or_manual_export',
    'partial',
    '{
      "code":"src_linkedin_credit_roles",
      "provider":"linkedin",
      "coverage":"people_search_aggregate",
      "metricsTracked":["credit_related_employee_count","risk_related_employee_count","underwriting_related_employee_count","collections_related_employee_count","role_family","role_title","profile_sample_size"],
      "roleFamilies":["credit","risk","underwriting","collections","capital_markets","treasury","fp&a","finance"],
      "historyTables":["company_linkedin_role_snapshots","company_source_metric_snapshots"],
      "captureMode":"aggregate_only",
      "cadence":"weekly",
      "compliance":"Store aggregate role counts and evidence metadata; avoid storing private personal profile data."
    }'::jsonb,
    'Aggregate role search only; no private personal data. Weekly cadence with backoff and manual review when confidence is low.',
    'degraded'
  ),
  (
    'src_linkedin_company_posts',
    'LinkedIn Company Posts & Hiring Narrative',
    'professional_network',
    'LinkedIn content signals',
    'official_api_or_manual_export',
    'partial',
    '{
      "code":"src_linkedin_company_posts",
      "provider":"linkedin",
      "coverage":"company_posts",
      "signalsTracked":["hiring_credit","funding_announcement","partnership","expansion","new_product","risk_or_credit_narrative"],
      "outputTables":["monitoring_outputs","company_signals"],
      "captureMode":"official_api_or_operator_verified_snapshot",
      "cadence":"weekly"
    }'::jsonb,
    'Capture only public/company-level posts through authorized access or operator-verified snapshots.',
    'degraded'
  ),
  (
    'src_exame_negocios_rss',
    'Exame Negócios / Google News RSS',
    'rss',
    'Business media',
    'none',
    'real',
    '{"code":"src_exame_negocios_rss","provider":"google-news-rss","domain":"exame.com","queryTemplate":"{company} (credito OR crédito OR FIDC OR debenture OR funding OR captacao OR captação) site:exame.com"}'::jsonb,
    'Public Google News RSS query; use low-frequency company monitoring.',
    'healthy'
  ),
  (
    'src_brazil_journal_rss',
    'Brazil Journal / Google News RSS',
    'rss',
    'Business media',
    'none',
    'real',
    '{"code":"src_brazil_journal_rss","provider":"google-news-rss","domain":"braziljournal.com","queryTemplate":"{company} (credito OR crédito OR FIDC OR debenture OR funding OR captacao OR captação) site:braziljournal.com"}'::jsonb,
    'Public Google News RSS query; high-signal business/funding coverage.',
    'healthy'
  ),
  (
    'src_pipeline_valor_empresas_rss',
    'Valor Empresas / Google News RSS',
    'rss',
    'Business media',
    'none',
    'real',
    '{"code":"src_pipeline_valor_empresas_rss","provider":"google-news-rss","domain":"valor.globo.com","queryTemplate":"{company} (credito OR crédito OR FIDC OR debenture OR funding OR captacao OR captação) site:valor.globo.com"}'::jsonb,
    'Public Google News RSS query; respect paywall and store only metadata/excerpts.',
    'healthy'
  ),
  (
    'src_neofeed_rss',
    'NeoFeed / Google News RSS',
    'rss',
    'Business media',
    'none',
    'real',
    '{"code":"src_neofeed_rss","provider":"google-news-rss","domain":"neofeed.com.br","queryTemplate":"{company} (credito OR crédito OR FIDC OR debenture OR funding OR captacao OR captação) site:neofeed.com.br"}'::jsonb,
    'Public Google News RSS query focused on business growth and capital market signals.',
    'healthy'
  ),
  (
    'src_finsiders_rss',
    'Finsiders / Google News RSS',
    'rss',
    'Fintech media',
    'none',
    'real',
    '{"code":"src_finsiders_rss","provider":"google-news-rss","domain":"finsiders.com.br","queryTemplate":"{company} (credito OR crédito OR fintech OR FIDC OR recebiveis OR recebíveis OR funding) site:finsiders.com.br"}'::jsonb,
    'Public Google News RSS query focused on fintech and credit product signals.',
    'healthy'
  ),
  (
    'src_startups_com_br_rss',
    'Startups.com.br / Google News RSS',
    'rss',
    'Startup media',
    'none',
    'real',
    '{"code":"src_startups_com_br_rss","provider":"google-news-rss","domain":"startups.com.br","queryTemplate":"{company} (rodada OR captacao OR captação OR credito OR crédito OR fintech OR expansão OR hiring) site:startups.com.br"}'::jsonb,
    'Public Google News RSS query focused on startup funding and growth signals.',
    'healthy'
  ),
  (
    'src_infomoney_business_rss',
    'InfoMoney Empresas / Google News RSS',
    'rss',
    'Business media',
    'none',
    'real',
    '{"code":"src_infomoney_business_rss","provider":"google-news-rss","domain":"infomoney.com.br","queryTemplate":"{company} (credito OR crédito OR FIDC OR debenture OR funding OR captacao OR captação) site:infomoney.com.br"}'::jsonb,
    'Public Google News RSS query; store metadata/excerpts only.',
    'healthy'
  ),
  (
    'src_bloomberg_linea_rss',
    'Bloomberg Línea / Google News RSS',
    'rss',
    'LatAm business media',
    'none',
    'real',
    '{"code":"src_bloomberg_linea_rss","provider":"google-news-rss","domain":"bloomberglinea.com.br","queryTemplate":"{company} (credito OR crédito OR FIDC OR debenture OR funding OR captacao OR captação) site:bloomberglinea.com.br"}'::jsonb,
    'Public Google News RSS query; useful for LatAm capital/funding context.',
    'healthy'
  )
on conflict (id) do update set
  name = excluded.name,
  source_type = excluded.source_type,
  category = excluded.category,
  auth_requirement = excluded.auth_requirement,
  status = excluded.status,
  metadata = excluded.metadata,
  rate_limit_notes = excluded.rate_limit_notes,
  health = excluded.health,
  updated_at = now();
