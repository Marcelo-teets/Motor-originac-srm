-- Mirror-only Data Platform Fase 2 / Frente D.
-- Apply separately through Supabase MCP. Codex did not execute this DDL/DML.
-- Purpose: classify sources into five tiers and seed BR structured-credit expansion sources.

update public.source_catalog
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'tier', case
        when category = 'regulatory' then 'tier_1_official_regulatory'
        when category = 'company_site' then 'tier_2_company_controlled'
        when category in ('news_traditional', 'news_niche') then 'tier_3_market_news'
        when category in ('vc_portfolio', 'social_signal') then 'tier_4_ecosystem_signals'
        else 'tier_5_supplemental_enrichment'
      end,
      'tierVersion', 'frente_d_2026_06'
    ),
    criticality = case
      when category = 'regulatory' then 'high'
      when category = 'company_site' then 'high'
      when category in ('news_traditional', 'news_niche') then coalesce(nullif(criticality, ''), 'medium')
      else coalesce(nullif(criticality, ''), 'medium')
    end,
    health = coalesce(nullif(health, ''), 'healthy'),
    validation_rule = coalesce(
      nullif(validation_rule, ''),
      case
        when source_type = 'rss' then 'Validate title, link, published_at and company/context match before promotion.'
        when category = 'company_site' then 'Validate URL reachability, content hash and company-domain match.'
        when category = 'regulatory' then 'Validate official source identity and CNPJ/company registry alignment.'
        else 'Validate source payload shape and evidence URL before promotion.'
      end
    ),
    updated_at = now();

insert into public.source_catalog(
  name, url, category, scope, priority, criticality, frequency, status, validation_rule,
  metadata, source_type, auth_requirement, rate_limit_notes, health
) values
  ('B3 Renda Fixa e Valores Mobiliarios', 'https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/', 'regulatory', 'BR', 1, 'high', 'daily', 'planned', 'Track debentures, CRI, CRA and listed structured-credit instruments by issuer.', jsonb_build_object('code','src_b3_renda_fixa','tier','tier_1_official_regulatory','signals',jsonb_build_array('debt_market_access','structured_credit_activity')), 'dataset_api', 'none_or_registration', 'Confirm endpoint/export access before production ingestion.', 'degraded'),
  ('ANBIMA Debentures e Mercado de Capitais', 'https://data.anbima.com.br/', 'regulatory', 'BR', 1, 'high', 'daily', 'planned', 'Track issuer, instrument, pricing and market-comparable fields.', jsonb_build_object('code','src_anbima_debentures','tier','tier_1_official_regulatory','signals',jsonb_build_array('dcm_comparable','pricing_reference')), 'dataset_api', 'none_or_registration', 'Use public data respecting ANBIMA access rules.', 'degraded'),
  ('Registradoras de Recebiveis Autorizadas', 'https://www.bcb.gov.br/estabilidadefinanceira/registradoras', 'receivables_credit', 'BR', 1, 'high', 'on_demand', 'planned', 'Use only with authorization to validate receivables depth and collateral eligibility.', jsonb_build_object('code','src_registradoras_recebiveis_authorized','tier','tier_1_authorized_credit','requiresAuthorization',true), 'authorized_api', 'client_authorization', 'Contractual/authorized access only.', 'degraded'),
  ('Banco Central SCR Autorizado', 'https://www.bcb.gov.br/estabilidadefinanceira/scr', 'credit_bureau_authorized', 'BR', 1, 'high', 'on_demand', 'planned', 'Use only with borrower authorization to validate credit exposure and leverage.', jsonb_build_object('code','src_bcb_scr_authorized','tier','tier_1_authorized_credit','requiresAuthorization',true), 'authorized_api', 'client_authorization', 'Regulated access only with explicit authorization.', 'degraded'),
  ('PGFN Divida Ativa e Regularidade Fiscal', 'https://www.gov.br/pgfn/pt-br/assuntos/divida-ativa-da-uniao', 'fiscal_risk', 'BR', 2, 'high', 'weekly', 'planned', 'Check fiscal debt and regularity risk before qualification promotion.', jsonb_build_object('code','src_pgfn_divida_ativa','tier','tier_2_risk_official','signals',jsonb_build_array('tax_debt_red_flag','fiscal_stress')), 'dataset_api', 'none', 'Public data; validate layout before ingestion.', 'degraded'),
  ('CENPROT Protestos', 'https://www.pesquisaprotesto.com.br/', 'legal_risk', 'BR', 2, 'high', 'weekly', 'planned', 'Check protest status as liquidity-stress red flag.', jsonb_build_object('code','src_cenprot_protestos','tier','tier_2_risk_official','signals',jsonb_build_array('protest_red_flag')), 'website_or_authorized_api', 'none_or_paid', 'Respect ToS; use official/paid access where required.', 'degraded'),
  ('SEFAZ NF-e Autorizada', 'https://www.nfe.fazenda.gov.br/', 'revenue_receivables', 'BR', 1, 'high', 'on_demand', 'planned', 'Use only with explicit authorization to validate invoice-backed receivables.', jsonb_build_object('code','src_sefaz_nfe_authorized','tier','tier_1_authorized_credit','requiresAuthorization',true), 'authorized_api', 'client_authorization', 'State-dependent and authorization-gated.', 'degraded')
on conflict (name, url) do update set
  category = excluded.category,
  scope = excluded.scope,
  priority = excluded.priority,
  criticality = excluded.criticality,
  frequency = excluded.frequency,
  status = excluded.status,
  validation_rule = excluded.validation_rule,
  metadata = public.source_catalog.metadata || excluded.metadata,
  source_type = excluded.source_type,
  auth_requirement = excluded.auth_requirement,
  rate_limit_notes = excluded.rate_limit_notes,
  health = excluded.health,
  updated_at = now();

comment on table public.source_catalog is 'Source catalog classified into five tiers through metadata.tier for Data Platform Frente D.';
