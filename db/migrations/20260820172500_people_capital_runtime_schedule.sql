-- Ensure the existing People & Capital sources are part of the canonical bounded capture runtime.
-- No new source is introduced here.

update public.source_catalog
set
  status = case when status='planned' then 'partial' else status end,
  health = 'healthy',
  metadata = coalesce(metadata,'{}'::jsonb)
    || jsonb_build_object(
      'implementedRuntime', true,
      'schedulePolicy', jsonb_build_object(
        'runner','bounded_capture',
        'cadence','daily',
        'cronUtc','15 9 * * *',
        'enabled',true,
        'timezone','UTC',
        'workflowFile','.github/workflows/capture.yml'
      )
    ),
  updated_at = now()
where metadata->>'code' = 'src_company_careers';

update public.source_catalog
set
  status = case when status='planned' then 'partial' else status end,
  health = 'healthy',
  metadata = coalesce(metadata,'{}'::jsonb)
    || jsonb_build_object(
      'implementedRuntime', true,
      'schedulePolicy', jsonb_build_object(
        'runner','bounded_capture',
        'cadence','daily',
        'cronUtc','15 9 * * *',
        'enabled',true,
        'timezone','UTC',
        'workflowFile','.github/workflows/capture.yml'
      )
    ),
  updated_at = now()
where metadata->>'code' = 'src_tech_signals_latam';

comment on table public.company_job_openings is
  'Persisted first-party/company-careers job openings used by People & Capital Intelligence.';
comment on table public.company_investor_relationships is
  'Observed investor-company relationships used by People & Capital Intelligence and origination timing.';
