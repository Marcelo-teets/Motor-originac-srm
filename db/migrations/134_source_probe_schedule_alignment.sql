begin;

update public.source_schedule_registry r
set cadence = 'weekly',
    cron_utc = '0 12 * * 2',
    workflow_file = '.github/workflows/source-activation-probes.yml',
    notes = 'Scheduled activation probe; ingestion remains blocked until the connector and any required authorization are ready.',
    updated_at = now()
from public.source_catalog s
where s.id = r.source_id
  and s.status = 'planned'
  and r.runner = 'source_probe';

update public.source_catalog s
set frequency = r.cadence,
    metadata = coalesce(s.metadata, '{}'::jsonb) || jsonb_build_object(
      'schedulePolicy', jsonb_build_object(
        'runner', r.runner,
        'cadence', r.cadence,
        'cronUtc', r.cron_utc,
        'workflowFile', r.workflow_file,
        'enabled', r.enabled,
        'maxRows', r.max_rows,
        'timezone', r.timezone
      )
    ),
    updated_at = now()
from public.source_schedule_registry r
where r.source_id = s.id
  and s.status = 'planned'
  and r.runner = 'source_probe';

commit;
