-- Register search-discovery as a first-class scheduled source runner and
-- persist AgFeed RSS against the daily Search Profile Discovery workflow.
--
-- This keeps source governance aligned with the runtime that already owns
-- discovery and avoids creating a duplicate capture path.

begin;

alter table public.source_schedule_registry
  drop constraint if exists source_schedule_registry_runner_check;

alter table public.source_schedule_registry
  add constraint source_schedule_registry_runner_check
  check (
    runner = any (
      array[
        'bounded_capture'::text,
        'capital_market'::text,
        'strategic_public'::text,
        'public_bulk'::text,
        'bndes'::text,
        'finep'::text,
        'agentetome'::text,
        'fidcs'::text,
        'source_probe'::text,
        'manual_only'::text,
        'search_discovery'::text
      ]
    )
  );

insert into public.source_schedule_registry (
  source_id,
  runner,
  cadence,
  cron_utc,
  workflow_file,
  enabled,
  max_rows,
  timezone,
  notes,
  metadata
)
select
  sc.id,
  'search_discovery',
  'daily',
  '30 8 * * *',
  '.github/workflows/search-profile-discovery.yml',
  true,
  null,
  'UTC',
  'AgFeed RSS is queried by the scheduled Search Profile Discovery run. The workflow is the single owner of this capture path.',
  jsonb_build_object(
    'source_code', 'src_agfeed_rss',
    'runtime_scope', 'search-discovery',
    'schedule_owner', 'search-profile-discovery'
  )
from public.source_catalog sc
where sc.metadata ->> 'code' = 'src_agfeed_rss'
on conflict (source_id) do update set
  runner = excluded.runner,
  cadence = excluded.cadence,
  cron_utc = excluded.cron_utc,
  workflow_file = excluded.workflow_file,
  enabled = excluded.enabled,
  max_rows = excluded.max_rows,
  timezone = excluded.timezone,
  notes = excluded.notes,
  metadata = public.source_schedule_registry.metadata || excluded.metadata,
  updated_at = now();

-- Keep catalog metadata consistent with the persisted schedule registry.
update public.source_catalog
set metadata = jsonb_set(
      metadata,
      '{schedulePolicy}',
      jsonb_build_object(
        'runner', 'search_discovery',
        'cadence', 'daily',
        'cronUtc', '30 8 * * *',
        'workflowFile', '.github/workflows/search-profile-discovery.yml',
        'enabled', true,
        'timezone', 'UTC'
      ),
      true
    ),
    updated_at = now()
where metadata ->> 'code' = 'src_agfeed_rss';

commit;
