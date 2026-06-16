-- 031_linkedin_media_source_expansion.sql
-- LinkedIn/media source expansion for Origination Intelligence Platform.
-- Live schema note: companies.id and source_catalog.id are UUIDs.
-- Source logical identity is stored in source_catalog.metadata->>'code'.

create table if not exists public.company_source_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_id uuid not null references public.source_catalog(id),
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

create index if not exists idx_company_source_metric_snapshots_company
  on public.company_source_metric_snapshots(company_id, observed_at desc);

create index if not exists idx_company_source_metric_snapshots_source_metric
  on public.company_source_metric_snapshots(source_id, metric_key, observed_at desc);

create table if not exists public.company_linkedin_role_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_id uuid not null references public.source_catalog(id),
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

create index if not exists idx_company_linkedin_role_snapshots_company
  on public.company_linkedin_role_snapshots(company_id, observed_at desc);

create index if not exists idx_company_linkedin_role_snapshots_role_family
  on public.company_linkedin_role_snapshots(role_family, observed_at desc);

create unique index if not exists uq_company_linkedin_role_snapshots_identity
  on public.company_linkedin_role_snapshots(company_id, source_id, role_family, coalesce(role_title, ''), observed_at);

insert into public.source_catalog (name, source_type, category, auth_requirement, status, metadata, rate_limit_notes, health)
select v.name, v.source_type, v.category, v.auth_requirement, v.status,
       jsonb_build_object('code', v.code, 'provider', v.provider, 'domain', v.domain, 'cadence', v.cadence),
       v.rate_limit_notes, v.health
from (values
  ('src_linkedin_company_page','LinkedIn Company Page Metrics','professional_network','LinkedIn company intelligence','official_api_or_manual_export','partial','linkedin',null,'weekly','Authorized API/export/operator snapshot only.','degraded'),
  ('src_linkedin_credit_roles','LinkedIn Credit & Risk Role Intelligence','professional_network','LinkedIn people intelligence','official_api_or_manual_export','partial','linkedin',null,'weekly','Aggregate role counts only.','degraded'),
  ('src_linkedin_company_posts','Professional Network Company Posts','professional_network','Professional network content','official_api_or_manual_export','partial','linkedin',null,'weekly','Company level public posts only.','degraded'),
  ('src_exame_negocios_rss','Exame News RSS','rss','Business media','none','real','google-news-rss','exame.com','daily','Public RSS query.','healthy'),
  ('src_brazil_journal_rss','Brazil Journal RSS','rss','Business media','none','real','google-news-rss','braziljournal.com','daily','Public RSS query.','healthy'),
  ('src_pipeline_valor_empresas_rss','Valor Empresas RSS','rss','Business media','none','real','google-news-rss','valor.globo.com','daily','Public RSS query.','healthy'),
  ('src_neofeed_rss','NeoFeed RSS','rss','Business media','none','real','google-news-rss','neofeed.com.br','daily','Public RSS query.','healthy'),
  ('src_finsiders_rss','Finsiders RSS','rss','Fintech media','none','real','google-news-rss','finsiders.com.br','daily','Public RSS query.','healthy'),
  ('src_startups_com_br_rss','Startups BR RSS','rss','Startup media','none','real','google-news-rss','startups.com.br','daily','Public RSS query.','healthy'),
  ('src_infomoney_business_rss','InfoMoney Business RSS','rss','Business media','none','real','google-news-rss','infomoney.com.br','daily','Public RSS query.','healthy'),
  ('src_bloomberg_linea_rss','Bloomberg Linea RSS','rss','LatAm business media','none','real','google-news-rss','bloomberglinea.com.br','daily','Public RSS query.','healthy')
) as v(code, name, source_type, category, auth_requirement, status, provider, domain, cadence, rate_limit_notes, health)
where not exists (
  select 1 from public.source_catalog sc where sc.metadata->>'code' = v.code
);
