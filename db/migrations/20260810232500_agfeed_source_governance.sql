-- 20260810232500_agfeed_source_governance.sql
-- Adds AgFeed as a governed agro business-media source for search discovery.
-- Transport remains Google News RSS; publisher/domain identity is AgFeed.

insert into public.source_catalog (
  name,
  url,
  category,
  scope,
  priority,
  criticality,
  frequency,
  status,
  validation_rule,
  metadata,
  source_type,
  auth_requirement,
  rate_limit_notes,
  health
)
select
  'AgFeed RSS',
  'https://agfeed.com.br/',
  'Agro business media',
  'BR',
  2,
  'medium',
  'frequent',
  'real',
  'Publisher domain must be agfeed.com.br; Google News is transport only; evidence remains subject to entity normalization, relevance gate and human review.',
  jsonb_build_object(
    'code', 'src_agfeed_rss',
    'domain', 'agfeed.com.br',
    'provider', 'google-news-rss',
    'runtimeScope', 'search-discovery',
    'verifiedAt', '2026-08-10T23:25:00Z',
    'verificationEvidence', jsonb_build_array(
      'https://agfeed.com.br/',
      'https://agfeed.com.br/agtech/escolhida-da-john-deere-goflux-lanca-fidc-para-financiar-r-1-bilhao-em-fretes-do-agro/',
      'https://agfeed.com.br/negocios/goflux-acelera-com-novo-fidc-banco-e-plano-safra-do-frete-com-pirelli-e-localiza-a-bordo/'
    ),
    'schedulePolicy', jsonb_build_object(
      'runner', 'search_discovery',
      'cadence', 'on_search',
      'enabled', true,
      'timezone', 'UTC'
    )
  ),
  'rss',
  'none',
  'Public publisher queried through bounded Google News RSS transport; no authenticated scraping.',
  'healthy'
where not exists (
  select 1
  from public.source_catalog
  where metadata->>'code' = 'src_agfeed_rss'
);

update public.source_catalog
set
  name = 'AgFeed RSS',
  url = 'https://agfeed.com.br/',
  category = 'Agro business media',
  scope = 'BR',
  priority = 2,
  criticality = 'medium',
  frequency = 'frequent',
  status = 'real',
  validation_rule = 'Publisher domain must be agfeed.com.br; Google News is transport only; evidence remains subject to entity normalization, relevance gate and human review.',
  source_type = 'rss',
  auth_requirement = 'none',
  rate_limit_notes = 'Public publisher queried through bounded Google News RSS transport; no authenticated scraping.',
  health = 'healthy',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'domain', 'agfeed.com.br',
    'provider', 'google-news-rss',
    'runtimeScope', 'search-discovery',
    'verifiedAt', '2026-08-10T23:25:00Z',
    'verificationEvidence', jsonb_build_array(
      'https://agfeed.com.br/',
      'https://agfeed.com.br/agtech/escolhida-da-john-deere-goflux-lanca-fidc-para-financiar-r-1-bilhao-em-fretes-do-agro/',
      'https://agfeed.com.br/negocios/goflux-acelera-com-novo-fidc-banco-e-plano-safra-do-frete-com-pirelli-e-localiza-a-bordo/'
    ),
    'schedulePolicy', jsonb_build_object(
      'runner', 'search_discovery',
      'cadence', 'on_search',
      'enabled', true,
      'timezone', 'UTC'
    )
  ),
  updated_at = now()
where metadata->>'code' = 'src_agfeed_rss';
