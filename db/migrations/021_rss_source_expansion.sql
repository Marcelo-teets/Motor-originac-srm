-- RSS source expansion for origination monitoring.
-- Rewritten for issue #86: production source_catalog uses UUID ids, so this
-- migration must not assume text ids. Logical identity is metadata->>'code';
-- rows are inserted without id (database default) and updated by code.
-- Idempotent for both legacy environments (where the original text-id version
-- already ran) and the live UUID schema.

update public.source_catalog sc
set
  name = v.name,
  source_type = v.source_type,
  category = v.category,
  auth_requirement = v.auth_requirement,
  status = v.status,
  metadata = coalesce(sc.metadata, '{}'::jsonb) || v.metadata,
  rate_limit_notes = v.rate_limit_notes,
  health = v.health,
  updated_at = now()
from (values
  ('src_fidc_market_rss', 'FIDC Market Signals RSS', 'rss', 'DCM market intelligence', 'none', 'real', '{"code":"src_fidc_market_rss","provider":"google-news-rss","queryTemplate":"{company} FIDC recebiveis securitizacao"}'::jsonb, 'Public RSS query.', 'healthy'),
  ('src_dcm_funding_rss', 'DCM Funding Signals RSS', 'rss', 'Funding signals', 'none', 'real', '{"code":"src_dcm_funding_rss","provider":"google-news-rss","queryTemplate":"{company} captacao divida debenture funding"}'::jsonb, 'Public RSS query.', 'healthy')
) as v(code, name, source_type, category, auth_requirement, status, metadata, rate_limit_notes, health)
where sc.metadata->>'code' = v.code;

insert into public.source_catalog (name, source_type, category, auth_requirement, status, metadata, rate_limit_notes, health)
select v.name, v.source_type, v.category, v.auth_requirement, v.status, v.metadata, v.rate_limit_notes, v.health
from (values
  ('src_fidc_market_rss', 'FIDC Market Signals RSS', 'rss', 'DCM market intelligence', 'none', 'real', '{"code":"src_fidc_market_rss","provider":"google-news-rss","queryTemplate":"{company} FIDC recebiveis securitizacao"}'::jsonb, 'Public RSS query.', 'healthy'),
  ('src_dcm_funding_rss', 'DCM Funding Signals RSS', 'rss', 'Funding signals', 'none', 'real', '{"code":"src_dcm_funding_rss","provider":"google-news-rss","queryTemplate":"{company} captacao divida debenture funding"}'::jsonb, 'Public RSS query.', 'healthy')
) as v(code, name, source_type, category, auth_requirement, status, metadata, rate_limit_notes, health)
where not exists (
  select 1 from public.source_catalog sc where sc.metadata->>'code' = v.code
);
