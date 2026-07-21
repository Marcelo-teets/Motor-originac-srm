-- 048_b2b_scraper_fidc_source_expansion.sql
-- Registers B2B P0 scraper sources and the FIDC public-data source layer.
-- Also reconciles the live schema, where migration 029 did not complete because
-- legacy source_catalog IDs were text while production uses UUID IDs.

-- ---------------------------------------------------------------------------
-- 1. Restore the source-treatment foundation idempotently.
-- ---------------------------------------------------------------------------
create table if not exists public.source_treatment_rules (
  id uuid primary key default gen_random_uuid(),
  source_code text not null,
  signal_type text not null,
  signal_family text not null,
  strength_floor integer not null default 60,
  confidence_delta numeric(5,2) not null default 0,
  structural_score_delta integer not null default 0,
  timing_score_delta integer not null default 0,
  executability_score_delta integer not null default 0,
  pattern_tags text[] not null default array[]::text[],
  treatment_policy jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(source_code, signal_type)
);

alter table public.source_treatment_rules enable row level security;
revoke all on table public.source_treatment_rules from public, anon, authenticated;
grant all on table public.source_treatment_rules to service_role;

-- ---------------------------------------------------------------------------
-- 2. Resolve duplicated logical codes found in the live catalog.
-- Preserve every source row. Canonical June sources keep their existing codes;
-- the older May rows receive explicit legacy codes so lineage is not deleted.
-- ---------------------------------------------------------------------------
update public.source_catalog
set metadata = jsonb_set(metadata, '{code}', to_jsonb('src_fintechs_brasil_legacy_rss'::text), true),
    updated_at = now()
where metadata->>'code' = 'src_google_news_rss'
  and name = 'Fintechs Brasil';

update public.source_catalog
set metadata = jsonb_set(metadata, '{code}', to_jsonb('src_startups_com_br_legacy_rss'::text), true),
    updated_at = now()
where metadata->>'code' = 'src_google_news_rss'
  and name = 'Startups.com.br';

update public.source_catalog
set metadata = jsonb_set(metadata, '{code}', to_jsonb('src_brazil_journal_legacy_rss'::text), true),
    updated_at = now()
where metadata->>'code' = 'src_valor_rss'
  and name = 'Brazil Journal';

update public.source_catalog
set metadata = jsonb_set(metadata, '{code}', to_jsonb('src_pipeline_valor_legacy_rss'::text), true),
    updated_at = now()
where metadata->>'code' = 'src_valor_rss'
  and name = 'Pipeline Valor';

create unique index if not exists source_catalog_metadata_code_uidx
  on public.source_catalog ((metadata->>'code'))
  where coalesce(metadata->>'code', '') <> '';

-- ---------------------------------------------------------------------------
-- 3. Register sources. source_catalog.id is UUID with a database default;
-- metadata->>'code' is the stable logical identity.
-- Token-gated sources stay planned until credentials are available.
-- CVM datasets already governed by migration 035 keep their canonical codes.
-- ---------------------------------------------------------------------------
insert into public.source_catalog (
  name, source_type, category, auth_requirement, status, metadata,
  rate_limit_notes, health
)
select
  v.name,
  v.source_type,
  v.category,
  v.auth_requirement,
  v.status,
  jsonb_build_object(
    'code', v.code,
    'provider', v.provider,
    'baseUrl', v.base_url,
    'captureMode', v.capture_mode,
    'notes', v.notes
  ),
  v.rate_limit_notes,
  v.health
from (values
  ('src_company_website_deep','Company Website Deep Scraper','scraper','company_site','none','real','company_website_deep_scraper',null,'first_party_http','Deep crawl of up to 10 public pages (about/products/enterprise/partners/pricing/careers/docs) with B2B signal detection.','Respect robots and progressive backoff; max ~26 candidate paths per run.','healthy'),
  ('src_professional_network_company','Professional Network Company Profile','scraper','professional_network','none','partial','professional_network_company_scraper','https://www.linkedin.com','public_profile_http','Public institutional profile page only; expect frequent partial status due to bot challenge.','Single page per run; degrade gracefully to partial.','degraded'),
  ('src_cvm_fundos_estruturados_medidas','CVM Fundos Estruturados: Medidas','dataset_http','Fundos estruturados','none','real','cvm_ckan','https://dados.cvm.gov.br/dataset/?q=FIDC','ckan_package_show','PL and cotistas aggregates for structured funds including FIDC.','Public CKAN API.','healthy'),
  ('src_cvm_fundos_documentos_entrega','CVM Fundos: Documentos: Entrega','dataset_http','Regulatório','none','real','cvm_ckan','https://dados.cvm.gov.br/dataset/?q=fundos+de+investimento','ckan_package_show','Periodic/eventual disclosure delivery metadata.','Public CKAN API.','healthy'),
  ('src_anbima_fundos_estruturados','ANBIMA API Fundos Estruturados','api','Fundos estruturados','client_credentials_token','planned','anbima','https://api.anbima.com.br/feed/fundos/v1/fundos-estruturados','token_api','Paginated FIDC/FII/FIP feed with RCVM 175 context; runtime enablement pending ANBIMA token.','Token required; pagination runner out of scope this cycle.','degraded'),
  ('src_anbima_fundos_icvm_555','ANBIMA API Fundos ICVM 555','api','Fundos estruturados','client_credentials_token','planned','anbima','https://api.anbima.com.br/feed/fundos/v1/fundos','token_api','Complementary universe cross-check.','Token required.','degraded'),
  ('src_infosimples_cvm_participante','Infosimples API CVM Participante','rpa_api','Prestadores','token','planned','infosimples','https://infosimples.com/consultas/cvm-participante/','token_api','KYC/KYP of regulated participants by CNPJ.','Paid token; enable explicitly.','degraded'),
  ('src_portal_transparencia_api','Portal da Transparência API','api','Setor público','token','planned','portal_transparencia','https://portaldatransparencia.gov.br/api-de-dados','token_api','Contracts/payments cross-check for FIDC service providers.','Free token required (chave-api-dados).','degraded')
) as v(code, name, source_type, category, auth_requirement, status, provider, base_url, capture_mode, notes, rate_limit_notes, health)
where not exists (
  select 1
  from public.source_catalog sc
  where sc.metadata->>'code' = v.code
);

insert into public.source_treatment_rules (
  source_code, signal_type, signal_family, strength_floor, confidence_delta,
  structural_score_delta, timing_score_delta, executability_score_delta,
  pattern_tags, treatment_policy
)
values
  ('src_company_website_deep','credit_product_signal','structural_need',86,0.06,12,4,5,array['credit_is_core','embedded_finance_pressure'],'{"output":"company_signals","qualification_use":"has_credit_product=true when product pages confirm credit/financing offer"}'::jsonb),
  ('src_company_website_deep','receivables_signal','receivables',88,0.06,12,4,6,array['receivables_strong','funding_gap'],'{"output":"company_signals","qualification_use":"has_receivables=true when site confirms receivables/anticipation flows"}'::jsonb),
  ('src_company_website_deep','embedded_finance_signal','embedded_finance',84,0.05,10,4,5,array['embedded_finance_pressure'],'{"output":"company_signals","qualification_use":"structural need up when embedded finance rails are confirmed"}'::jsonb),
  ('src_company_website_deep','collections_stack_signal','asset_quality',78,0.03,5,3,3,array['receivables_quality'],'{"output":"company_signals","qualification_use":"collections maturity input for receivables quality review"}'::jsonb),
  ('src_company_website_deep','underwriting_risk_signal','governance',80,0.04,6,3,4,array['governance_signal'],'{"output":"company_signals","qualification_use":"underwriting/risk maturity input"}'::jsonb),
  ('src_company_website_deep','b2b_distribution_signal','growth',68,0.02,3,3,2,array['expansion'],'{"output":"company_signals","qualification_use":"weak B2B distribution corroboration; needs pairing"}'::jsonb),
  ('src_professional_network_company','linkedin_credit_team_signal','latent_growth',82,0.04,6,7,3,array['growth_without_funding'],'{"output":"company_signals","qualification_use":"latent credit team buildout signal"}'::jsonb),
  ('src_professional_network_company','linkedin_capital_markets_team_signal','capital_structure',80,0.04,6,6,4,array['capital_structure','funding_gap'],'{"output":"company_signals","qualification_use":"capital markets/treasury capability signal"}'::jsonb),
  ('src_professional_network_company','growth_hiring_signal','latent_growth',70,0.02,3,5,2,array['growth_without_funding'],'{"output":"company_signals","qualification_use":"weak growth signal; needs corroboration"}'::jsonb),
  ('src_cvm_fidc_monthly','fidc_dataset_update_signal','capital_structure',70,0.04,4,4,3,array['fidc_fit','capital_structure'],'{"output":"company_signals","qualification_use":"FIDC ecosystem context for structured funding fit"}'::jsonb)
on conflict (source_code, signal_type) do update set
  signal_family = excluded.signal_family,
  strength_floor = excluded.strength_floor,
  confidence_delta = excluded.confidence_delta,
  structural_score_delta = excluded.structural_score_delta,
  timing_score_delta = excluded.timing_score_delta,
  executability_score_delta = excluded.executability_score_delta,
  pattern_tags = excluded.pattern_tags,
  treatment_policy = excluded.treatment_policy;
