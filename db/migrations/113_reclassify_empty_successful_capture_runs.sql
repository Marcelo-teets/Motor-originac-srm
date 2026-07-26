-- DataCaptureEngine historically classified zero-result successful captures as
-- failed. These rows have no error and contain treatment diagnostics, so they
-- represent a valid empty result rather than a connector/runtime failure.

update public.source_connector_runs
set
  status = 'completed',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'auditCorrection', jsonb_build_object(
      'code', 'empty_success_not_failure',
      'correctedAt', now(),
      'reason', 'Successful capture returned no relevant documents and had no runtime error.'
    )
  )
where status = 'failed'
  and error_message is null
  and coalesce(items_collected, 0) = 0
  and coalesce(outputs_written, 0) = 0
  and metadata ? 'treatment';

comment on view public.gold_source_connector_run_diagnostics is
  'Connector run diagnostics. Completed runs with zero outputs are valid empty results and resolve to needs_review, not failed.';
