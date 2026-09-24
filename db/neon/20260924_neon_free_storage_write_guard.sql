-- Optional defensive migration, apply ONLY AFTER the business schema exists in Neon.
-- Guards large, non-critical write paths with a conservative 80% logical-database
-- threshold, well below the 96% free-plan objective (physical billed size may differ).
-- This migration DOES NOT replace project-level API billing checks.
CREATE SCHEMA IF NOT EXISTS neon_ops;
CREATE OR REPLACE FUNCTION neon_ops.reject_heavy_writes_over_budget()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_bytes bigint;
BEGIN
  v_bytes := pg_database_size(current_database());
  IF v_bytes >= 400000000 THEN
    RAISE EXCEPTION 'NEON_FREE_STORAGE_GUARD: heavy writes paused; database size % bytes',
      v_bytes USING ERRCODE = '53100';
  END IF;
  RETURN NULL; -- statement-level trigger ignores return
END;
$$;
REVOKE ALL ON FUNCTION neon_ops.reject_heavy_writes_over_budget() FROM PUBLIC;
DO $$
DECLARE v_table text; v_identifier text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'monitoring_outputs', 'company_signals', 'score_snapshots',
    'lead_score_snapshots', 'qualification_snapshots'
  ] LOOP
    IF to_regclass(format('public.%I',v_table)) IS NULL THEN CONTINUE; END IF;
    v_identifier := 'neon_free_guard_' || v_table;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I',v_identifier,v_table);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I
       FOR EACH STATEMENT EXECUTE FUNCTION neon_ops.reject_heavy_writes_over_budget()',
      v_identifier,v_table);
  END LOOP;
END;
$$;
-- This migration intentionally does not touch core company CRUD, Auth or pipeline.
-- Confirm trigger coverage if new ingestion tables are added after migration.
