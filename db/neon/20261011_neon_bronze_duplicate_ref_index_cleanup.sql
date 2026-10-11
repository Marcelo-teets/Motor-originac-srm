-- Remove only the strictly redundant dataset/reference B-tree index.
-- On 2026-10-11 both indexes were (dataset_code, ref_date DESC), 128 kB each.
-- Canonical index is preserved. This migration is idempotent and fail-closed.
do $$
declare
  v_canonical text;
  v_duplicate text;
begin
  select indexdef into v_canonical from pg_indexes
   where schemaname = 'public'
     and tablename = 'bronze_historical_records'
     and indexname = 'bronze_historical_records_dataset_ref_idx';

  select indexdef into v_duplicate from pg_indexes
   where schemaname = 'public'
     and tablename = 'bronze_historical_records'
     and indexname = 'idx_bronze_historical_dataset_ref';

  if v_duplicate is null then
    return;
  end if;

  if v_canonical is null
     or regexp_replace(v_canonical, '^CREATE INDEX [^ ]+ ON ', 'CREATE INDEX canonical ON ')
        is distinct from
        regexp_replace(v_duplicate, '^CREATE INDEX [^ ]+ ON ', 'CREATE INDEX canonical ON ')
  then
    raise exception 'bronze_duplicate_index_definition_mismatch';
  end if;

  execute 'drop index public.idx_bronze_historical_dataset_ref';
end;
$$;
