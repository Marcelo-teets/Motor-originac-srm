-- Operational stabilization after production statement/job startup timeouts.
-- Reversible: original schedules/commands are documented at the bottom of this file.
-- No data is deleted and no source is disabled.

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'historical-excel-reconcile' limit 1;
  if v_job_id is not null then
    perform cron.alter_job(v_job_id, schedule := '7,37 * * * *');
  end if;

  select jobid into v_job_id from cron.job where jobname = 'historical-excel-queue' limit 1;
  if v_job_id is not null then
    perform cron.alter_job(v_job_id, schedule := '13 * * * *');
  end if;

  select jobid into v_job_id from cron.job where jobname = 'agentetome-due-export-refresh' limit 1;
  if v_job_id is not null then
    perform cron.alter_job(v_job_id, schedule := '27 * * * *');
  end if;

  select jobid into v_job_id from cron.job where jobname = 'origination-derived-reprocessing' limit 1;
  if v_job_id is not null then
    perform cron.alter_job(
      v_job_id,
      schedule := '2,12,22,32,42,52 * * * *',
      command := 'select * from public.process_origination_reprocessing_queue(15);'
    );
  end if;

  select jobid into v_job_id from cron.job where jobname = 'candidate-automatic-entity-resolution' limit 1;
  if v_job_id is not null then
    perform cron.alter_job(
      v_job_id,
      schedule := '9,39 * * * *',
      command := 'select * from public.auto_resolve_verified_candidate_entities_v4(25);'
    );
  end if;
end
$$;

-- Baseline before this migration:
-- historical-excel-reconcile: */15 * * * *
-- historical-excel-queue: 15 * * * *
-- agentetome-due-export-refresh: 17 * * * *
-- origination-derived-reprocessing: */5 * * * *, batch 25
-- candidate-automatic-entity-resolution: */15 * * * *, batch 50
