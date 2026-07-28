-- Separate production incidents from connectors that do not have a runtime yet.
-- A source without an implemented runtime is backlog/standby, not degraded.

update public.source_catalog
set status = 'planned',
    health = 'standby',
    metadata = metadata || jsonb_build_object(
      'implementedRuntime', false,
      'operationalState', 'not_implemented',
      'healthSemantics', 'standby_not_degraded',
      'reclassifiedAt', '2026-07-28T00:00:00-03:00'
    ),
    updated_at = now()
where health = 'degraded'
  and (
    metadata ->> 'implementedRuntime' = 'false'
    or metadata ->> 'code' in (
      'src_linkedin_company_page',
      'src_linkedin_credit_roles',
      'src_linkedin_company_posts',
      'src_professional_network_company'
    )
  );
