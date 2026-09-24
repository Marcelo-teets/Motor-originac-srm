-- Incident hotfix 2026-09-24: temporary, reversible workload containment.
-- Apply only after read-only database connectivity and backup confirmation.
-- No data is deleted, no schema is dropped, and the queue remains intact.
-- This reduces compute pressure; it does NOT remediate exceed_db_size_quota.
DO $$
DECLARE j record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'pg_cron not installed; stop and inspect deployment';
  END IF;
  -- Stop the known failing worker temporarily rather than repeatedly timing out.
  -- Important: this will accumulate unprocessed queue entries until restored.
  FOR j IN SELECT jobid FROM cron.job WHERE jobname='origination-derived-reprocessing' LOOP
    PERFORM cron.alter_job(j.jobid, active := false);
  END LOOP;
  -- Reduce competing low-priority jobs; preserve the existing commands and sources.
  FOR j IN SELECT jobid FROM cron.job WHERE jobname='historical-excel-reconcile' LOOP
    PERFORM cron.alter_job(j.jobid, schedule := '37 */6 * * *');
  END LOOP;
  FOR j IN SELECT jobid FROM cron.job WHERE jobname='historical-excel-queue' LOOP
    PERFORM cron.alter_job(j.jobid, schedule := '13 5 * * *');
  END LOOP;
  FOR j IN SELECT jobid FROM cron.job WHERE jobname='agentetome-due-export-refresh' LOOP
    PERFORM cron.alter_job(j.jobid, schedule := '27 */6 * * *');
  END LOOP;
  FOR j IN SELECT jobid FROM cron.job WHERE jobname='candidate-automatic-entity-resolution' LOOP
    PERFORM cron.alter_job(j.jobid, schedule := '9 * * * *');
  END LOOP;
END $$;
-- Verification (read-only):
-- SELECT jobid,jobname,schedule,active FROM cron.job
-- WHERE jobname IN ('origination-derived-reprocessing',
-- 'historical-excel-reconcile','historical-excel-queue',
-- 'agentetome-due-export-refresh','candidate-automatic-entity-resolution');
-- Rollback AFTER fixing slow query and confirming the quota is lifted:
-- DO $$ DECLARE j record; BEGIN
--   FOR j IN SELECT jobid FROM cron.job WHERE jobname='origination-derived-reprocessing' LOOP
--     PERFORM cron.alter_job(j.jobid, schedule := '2,32 * * * *',
--       command := 'select * from public.process_origination_reprocessing_queue(10);',
--       active := true);
--   END LOOP;
-- END $$;
