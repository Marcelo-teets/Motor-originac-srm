-- Data source infrastructure v1 for Origination Intelligence Platform.
-- Goal: expand monitored public sources without creating a parallel stack.
-- Notes:
-- - Local canonical schema uses text source_catalog.id.
-- - Supabase production has historically drifted toward uuid ids with metadata.code as runtime key.
-- - This migration is intentionally defensive and inserts by schema shape.

create extension if not exists pgcrypto;

create table if not exists source_catalog (
  id text primary key,
  name text not null unique,
  source_type text not null,
  category text not null,
  auth_requirement text,
  status text not null,
  metadata jsonb default '{}'::jsonb,
  rate_limit_notes text,
  health text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table source_catalog add column if not exists metadata jsonb default '{}'::jsonb;
alter table source_catalog add column if not exists rate_limit_notes text;
alter table source_catalog add column if not exists health text;
alter table source_catalog add column if not exists created_at timestamptz not null default now();
alter table source_catalog add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_source_catalog_metadata_code on source_catalog ((metadata->>'code'));
create index if not exists idx_source_catalog_category on source_catalog (category);
create index if not exists idx_source_catalog_status on source_catalog (status);

do $$
declare
  id_type text;
  has_source_type boolean;
  has_url boolean;
  has_priority boolean;
  rec record;
begin
  select data_type into id_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'source_catalog'
    and column_name = 'id';

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'source_catalog' and column_name = 'source_type'
  ) into has_source_type;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'source_catalog' and column_name = 'url'
  ) into has_url;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'source_catalog' and column_name = 'priority'
  ) into has_priority;

  for rec in
    select * from (values
      ('src_cnpj_brasilapi', 'BrasilAPI CNPJ', 'api', 'company_registry', 'https://brasilapi.com.br/api/cnpj/v1/{cnpj}', 'real', 'none', 'healthy', 100, '{"code":"src_brasilapi_cnpj","provider":"brasilapi","tags":["cnpj","registry","entity_resolution"],"signalFocus":"company_identity","expectedOutputs":["company_registry","entity_resolution","enrichment"]}'::jsonb, 'Public API; cache results and avoid repeated CNPJ calls.'),
      ('src_receita_cnpj_open_data', 'Receita Federal CNPJ Dados Abertos', 'dataset', 'company_registry', 'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/dados-abertos', 'planned', 'none', 'healthy', 100, '{"code":"src_receita_cnpj_open_data","provider":"receita-federal","tags":["cnpj","official","registry"],"signalFocus":"company_identity_official","expectedOutputs":["company_registry","qsa","cnae"]}'::jsonb, 'Official batch dataset; use loader job before replacing BrasilAPI runtime.'),
      ('src_cvm_fidc_informe_mensal', 'CVM FIDC Informes Mensais', 'dataset', 'fidc', 'https://dados.cvm.gov.br/dataset/fidc-doc-inf_mensal', 'real', 'none', 'healthy', 100, '{"code":"src_cvm_fidc_informe_mensal","provider":"cvm-dados-abertos","tags":["fidc","official","receivables","capital_markets"],"signalFocus":"existing_fidc_or_market_comparable","expectedOutputs":["has_fidc","fidc_comparable","market_map"]}'::jsonb, 'Official CVM dataset; implement batch loader and monthly refresh.'),
      ('src_cvm_rss', 'CVM News RSS', 'rss', 'regulatory', 'https://www.gov.br/cvm/pt-br/assuntos/noticias/rss', 'real', 'none', 'healthy', 90, '{"code":"src_cvm_rss","provider":"cvm","feedUrl":"https://www.gov.br/cvm/pt-br/assuntos/noticias/rss","tags":["cvm","regulatory","capital_markets"],"signalFocus":"regulatory_news"}'::jsonb, 'Public RSS.'),
      ('src_bcb_ifdata', 'Banco Central IFData', 'api', 'central_bank', 'https://olinda.bcb.gov.br/olinda/servico/IFDATA/versao/v1/odata/', 'planned', 'none', 'healthy', 95, '{"code":"src_bcb_ifdata","provider":"bcb-olinda","tags":["bcb","ifdata","regulated_financial_institutions"],"signalFocus":"regulated_financial_activity","expectedOutputs":["regulated_entity","financial_institution_signal"]}'::jsonb, 'Official BCB Olinda API; add connector when IFData mapping is implemented.'),
      ('src_anbima_data', 'ANBIMA Data Mercado de Capitais', 'web', 'capital_markets', 'https://data.anbima.com.br/', 'planned', 'none', 'healthy', 90, '{"code":"src_anbima_data","provider":"anbima","tags":["debenture","cri","cra","funds","capital_markets"],"signalFocus":"dcm_comparables","expectedOutputs":["has_dcm","market_map","comparables"]}'::jsonb, 'Use public search pages/API when available; respect access rules.'),
      ('src_company_website', 'Company Websites', 'website', 'company_site', null, 'real', 'none', 'healthy', 100, '{"code":"src_company_website","provider":"company-owned","tags":["primary_source","product","pricing","faq","terms"],"signalFocus":"observed_product_and_receivables_signals","expectedOutputs":["credit_product_signal","receivables_signal","positioning_change"]}'::jsonb, 'Primary public source; monitor homepage/product/pricing/FAQ/docs when available.'),
      ('src_google_news_rss', 'Google News Company RSS', 'rss', 'news_niche', null, 'real', 'none', 'healthy', 85, '{"code":"src_google_news_rss","provider":"google-news-rss","queryTemplate":"{company}","tags":["news","company_monitoring"],"signalFocus":"general_company_news"}'::jsonb, 'Public RSS query; dedupe by source and URL.'),
      ('src_fidc_market_rss', 'FIDC Market Signals RSS', 'rss', 'fidc', null, 'real', 'none', 'healthy', 95, '{"code":"src_fidc_market_rss","provider":"google-news-rss","queryTemplate":"{company} FIDC recebiveis securitizacao direitos creditórios","tags":["fidc","receivables","securitization"],"signalFocus":"first_fidc_or_structured_receivables"}'::jsonb, 'Public RSS query; good early signal for FIDC timing.'),
      ('src_dcm_funding_rss', 'DCM Funding Signals RSS', 'rss', 'dcm', null, 'real', 'none', 'healthy', 92, '{"code":"src_dcm_funding_rss","provider":"google-news-rss","queryTemplate":"{company} captacao divida debenture nota comercial funding","tags":["dcm","funding","debt"],"signalFocus":"debt_or_funding_timing"}'::jsonb, 'Public RSS query.'),
      ('src_vc_portfolio_rss', 'VC Portfolio Movement RSS', 'rss', 'vc_portfolio', null, 'real', 'none', 'healthy', 88, '{"code":"src_vc_portfolio_rss","provider":"google-news-rss","queryTemplate":"{company} venture capital rodada investimento portfolio","tags":["vc","portfolio","funding"],"signalFocus":"vc_backing_or_round_event"}'::jsonb, 'Use as runtime bridge until dedicated VC portfolio crawlers are implemented.'),
      ('src_credit_product_rss', 'Credit Product Launch RSS', 'rss', 'news_niche', null, 'real', 'none', 'healthy', 88, '{"code":"src_credit_product_rss","provider":"google-news-rss","queryTemplate":"{company} credito antecipacao capital de giro BNPL embedded finance","tags":["credit_product","embedded_finance","working_capital"],"signalFocus":"credit_product_launch_or_expansion"}'::jsonb, 'Public RSS query.'),
      ('src_pncp_contracts', 'PNCP Contratos e Compras Públicas', 'api', 'procurement', 'https://pncp.gov.br/api/consulta', 'planned', 'none', 'healthy', 80, '{"code":"src_pncp_contracts","provider":"pncp","tags":["contracts","public_receivables","government"],"signalFocus":"public_contract_receivables","expectedOutputs":["public_contract_receivables","concentration_government"]}'::jsonb, 'Official public procurement API; add CNPJ/name search connector.'),
      ('src_datajud_cnj', 'DataJud CNJ API Pública', 'api', 'judicial', 'https://api-publica.datajud.cnj.jus.br/', 'planned', 'api_key', 'healthy', 75, '{"code":"src_datajud_cnj","provider":"cnj","tags":["judicial","lawsuits","risk"],"signalFocus":"judicial_stress_or_risk","expectedOutputs":["judicial_or_fiscal_stress","risk_signal"]}'::jsonb, 'Requires API key/token; use only public metadata.'),
      ('src_inpi_public_data', 'INPI Dados Abertos', 'dataset', 'intellectual_property', 'https://www.gov.br/inpi/pt-br/central-de-conteudo/noticias/inpi-disponibiliza-dados-abertos-sobre-cinco-servicos', 'planned', 'none', 'healthy', 55, '{"code":"src_inpi_public_data","provider":"inpi","tags":["ip","software","brand","technology"],"signalFocus":"technology_and_brand_maturity","expectedOutputs":["tech_maturity","brand_assets"]}'::jsonb, 'Dataset source; lower origination priority than FIDC/registry/news.'),
      ('src_jobs_google_news_rss', 'Hiring and Finance Jobs RSS', 'rss', 'jobs', null, 'real', 'none', 'healthy', 72, '{"code":"src_jobs_google_news_rss","provider":"google-news-rss","queryTemplate":"{company} vagas crédito cobrança risk treasury CFO capital markets","tags":["jobs","hiring","credit_team"],"signalFocus":"hiring_credit_risk_or_treasury_team"}'::jsonb, 'Bridge for jobs signal until LinkedIn/Gupy connectors are implemented.'),
      ('src_contact_enrichment_paid', 'Paid Contact Enrichment Vendors', 'vendor', 'contact_enrichment', null, 'planned', 'api_key', 'degraded', 30, '{"code":"src_contact_enrichment_paid","provider":"apollo-lusha-hunter","tags":["contacts","outbound","paid_vendor"],"signalFocus":"commercial_execution_only","expectedOutputs":["decision_maker","corporate_email"]}'::jsonb, 'Use only after qualification; not a lead-quality source.')
    ) as t(id, name, source_type, category, url, status, auth_requirement, health, priority, metadata, rate_limit_notes)
  loop
    if id_type in ('uuid', 'USER-DEFINED') then
      if has_url and has_source_type and has_priority then
        execute 'insert into source_catalog (name, source_type, category, url, auth_requirement, status, metadata, rate_limit_notes, health, priority, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()) on conflict (name) do update set source_type = excluded.source_type, category = excluded.category, url = excluded.url, auth_requirement = excluded.auth_requirement, status = excluded.status, metadata = source_catalog.metadata || excluded.metadata, rate_limit_notes = excluded.rate_limit_notes, health = excluded.health, priority = excluded.priority, updated_at = now()'
        using rec.name, rec.source_type, rec.category, rec.url, rec.auth_requirement, rec.status, rec.metadata, rec.rate_limit_notes, rec.health, rec.priority;
      elsif has_url and has_source_type then
        execute 'insert into source_catalog (name, source_type, category, url, auth_requirement, status, metadata, rate_limit_notes, health, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) on conflict (name) do update set source_type = excluded.source_type, category = excluded.category, url = excluded.url, auth_requirement = excluded.auth_requirement, status = excluded.status, metadata = source_catalog.metadata || excluded.metadata, rate_limit_notes = excluded.rate_limit_notes, health = excluded.health, updated_at = now()'
        using rec.name, rec.source_type, rec.category, rec.url, rec.auth_requirement, rec.status, rec.metadata, rec.rate_limit_notes, rec.health;
      elsif has_source_type then
        execute 'insert into source_catalog (name, source_type, category, auth_requirement, status, metadata, rate_limit_notes, health, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (name) do update set source_type = excluded.source_type, category = excluded.category, auth_requirement = excluded.auth_requirement, status = excluded.status, metadata = source_catalog.metadata || excluded.metadata, rate_limit_notes = excluded.rate_limit_notes, health = excluded.health, updated_at = now()'
        using rec.name, rec.source_type, rec.category, rec.auth_requirement, rec.status, rec.metadata, rec.rate_limit_notes, rec.health;
      else
        execute 'insert into source_catalog (name, category, auth_requirement, status, metadata, rate_limit_notes, health, updated_at) values ($1,$2,$3,$4,$5,$6,$7,now()) on conflict (name) do update set category = excluded.category, auth_requirement = excluded.auth_requirement, status = excluded.status, metadata = source_catalog.metadata || excluded.metadata, rate_limit_notes = excluded.rate_limit_notes, health = excluded.health, updated_at = now()'
        using rec.name, rec.category, rec.auth_requirement, rec.status, rec.metadata, rec.rate_limit_notes, rec.health;
      end if;
    else
      if has_url and has_priority then
        execute 'insert into source_catalog (id, name, source_type, category, url, auth_requirement, status, metadata, rate_limit_notes, health, priority, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()) on conflict (id) do update set name = excluded.name, source_type = excluded.source_type, category = excluded.category, url = excluded.url, auth_requirement = excluded.auth_requirement, status = excluded.status, metadata = source_catalog.metadata || excluded.metadata, rate_limit_notes = excluded.rate_limit_notes, health = excluded.health, priority = excluded.priority, updated_at = now()'
        using rec.id, rec.name, rec.source_type, rec.category, rec.url, rec.auth_requirement, rec.status, rec.metadata, rec.rate_limit_notes, rec.health, rec.priority;
      elsif has_url then
        execute 'insert into source_catalog (id, name, source_type, category, url, auth_requirement, status, metadata, rate_limit_notes, health, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()) on conflict (id) do update set name = excluded.name, source_type = excluded.source_type, category = excluded.category, url = excluded.url, auth_requirement = excluded.auth_requirement, status = excluded.status, metadata = source_catalog.metadata || excluded.metadata, rate_limit_notes = excluded.rate_limit_notes, health = excluded.health, updated_at = now()'
        using rec.id, rec.name, rec.source_type, rec.category, rec.url, rec.auth_requirement, rec.status, rec.metadata, rec.rate_limit_notes, rec.health;
      else
        execute 'insert into source_catalog (id, name, source_type, category, auth_requirement, status, metadata, rate_limit_notes, health, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) on conflict (id) do update set name = excluded.name, source_type = excluded.source_type, category = excluded.category, auth_requirement = excluded.auth_requirement, status = excluded.status, metadata = source_catalog.metadata || excluded.metadata, rate_limit_notes = excluded.rate_limit_notes, health = excluded.health, updated_at = now()'
        using rec.id, rec.name, rec.source_type, rec.category, rec.auth_requirement, rec.status, rec.metadata, rec.rate_limit_notes, rec.health;
      end if;
    end if;
  end loop;
end $$;
