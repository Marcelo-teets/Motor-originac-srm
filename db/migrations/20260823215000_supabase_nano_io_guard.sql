-- Supabase Nano IO guard for the canonical free-plan project.
--
-- Goal: keep the origination engine operational without repeatedly exhausting the
-- burst Disk IO budget. This migration does not delete data, disable sources, or
-- change business logic. It only reduces polling frequency / batch size for the
-- highest-frequency pg_cron jobs that touch the hot database.
--
-- Baseline immediately before this guard (20260820022000_stabilize_pg_cron_contention.sql):
--   historical-excel-reconcile         2x/hour
--   historical-excel-queue             1x/hour
--   agentetome-due-export-refresh       1x/hour
--   origination-derived-reprocessing    6x/hour, batch 15
--   candidate-automatic-entity-resolution 2x/hour, batch 25
--
-- Nano guard target:
--   historical-excel-reconcile         every 6 hours
--   historical-excel-queue             daily
--   historical-excel-maintenance       daily (kept daily, explicitly normalized)
--   agentetome-due-export-refresh       every 6 hours
--   origination-derived-reprocessing    2x/hour, batch 10
--   candidate-automatic-entity-resolution 1x/hour, batch 15
--
-- All changes are reversible with cron.alter_job and are guarded by job existence.

do $$
declare
  v_job_id bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  select jobid into v_job_id
  from cron.job
  where jobname = 'historical-excel-reconcile'
  limit 1;
  if v_job_id is not null then
    perform cron.alter_job(
      v_job_id,
      schedule := '37 */6 * * *'
    );
  end if;

  v_job_id := null;
  select jobid into v_job_id
  from cron.job
  where jobname = 'historical-excel-queue'
  limit 1;
  if v_job_id is not null then
    perform cron.alter_job(
      v_job_id,
      schedule := '13 5 * * *'
    );
  end if;

  v_job_id := null;
  select jobid into v_job_id
  from cron.job
  where jobname = 'historical-excel-maintenance'
  limit 1;
  if v_job_id is not null then
    perform cron.alter_job(
      v_job_id,
      schedule := '20 6 * * *'
    );
  end if;

  v_job_id := null;
  select jobid into v_job_id
  from cron.job
  where jobname = 'agentetome-due-export-refresh'
  limit 1;
  if v_job_id is not null then
    perform cron.alter_job(
      v_job_id,
      schedule := '27 */6 * * *'
    );
  end if;

  v_job_id := null;
  select jobid into v_job_id
  from cron.job
  where jobname = 'origination-derived-reprocessing'
  limit 1;
  if v_job_id is not null then
    perform cron.alter_job(
      v_job_id,
      schedule := '2,32 * * * *',
      command := 'select * from public.process_origination_reprocessing_queue(10);'
    );
  end if;

  v_job_id := null;
  select jobid into v_job_id
  from cron.job
  where jobname = 'candidate-automatic-entity-resolution'
  limit 1;
  if v_job_id is not null then
    perform cron.alter_job(
      v_job_id,
      schedule := '9 * * * *',
      command := 'select * from public.auto_resolve_verified_candidate_entities_v4(15);'
    );
  end if;
end
$$;

create or replace function public.supabase_nano_io_guard_status()
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, cron
as $$
  select jsonb_build_object(
    'profile', 'nano_zero_cost_v1',
    'projectRef', 'hdghpmssudrqhsbvrdyt',
    'jobs', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'jobName', j.jobname,
          'schedule', j.schedule,
          'active', j.active,
          'database', j.database
        ) order by j.jobname
      ) filter (where j.jobid is not null),
      '[]'::jsonb
    ),
    'generatedAt', now()
  )
  from cron.job j
  where j.jobname in (
    'historical-excel-reconcile',
    'historical-excel-queue',
    'historical-excel-maintenance',
    'agentetome-due-export-refresh',
    'origination-derived-reprocessing',
    'candidate-automatic-entity-resolution'
  );
$$;

revoke all on function public.supabase_nano_io_guard_status()
  from public, anon, authenticated;
grant execute on function public.supabase_nano_io_guard_status()
  to service_role;

comment on function public.supabase_nano_io_guard_status() is
  'Service-role-only observability for the zero-cost Supabase Nano pg_cron profile. No secrets or row payloads are returned.';
