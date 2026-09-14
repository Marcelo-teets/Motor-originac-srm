-- Governed lineage for company-level firmographic enrichment used by the ICP headcount gate.
-- This is an operator/on-demand enrichment source, not a scheduled scraper.

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
  'External B2B Firmographic Enrichment',
  null,
  'firmographics',
  'BR',
  2,
  'high',
  'on_demand',
  'real',
  'Persist only matched company identity, provider business id, observed employee range and observation timestamp. Never promote identity from firmographics alone.',
  jsonb_build_object(
    'code','src_external_b2b_firmographics',
    'provider','vibe_prospecting_explorium',
    'captureMode','operator_enrichment_connector',
    'decisionUse','headcount_evidence_only',
    'identityAuthority',false,
    'scheduled',false
  ),
  'b2b_enrichment',
  'external_connector',
  'On-demand only; do not schedule bulk capture on free-tier infrastructure.',
  'healthy'
where not exists (
  select 1 from public.source_catalog
  where metadata->>'code'='src_external_b2b_firmographics'
);

notify pgrst,'reload schema';
