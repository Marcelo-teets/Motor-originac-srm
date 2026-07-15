-- Remove only the pre-canonical CVM offers canary rows.
-- Abort instead of deleting if the data has generated business lineage.

do $$
declare
  v_active_runs bigint;
  v_signals bigint;
  v_linked_events bigint;
  v_candidate_events bigint;
begin
  select count(*) into v_active_runs
  from public.capital_market_dataset_runs
  where status = 'running';

  select count(*) into v_signals
  from public.company_signals
  where signal_type = 'capital_market_event';

  select count(*) into v_linked_events
  from public.capital_market_events
  where issuer_company_id is not null;

  select count(*) into v_candidate_events
  from public.capital_market_events
  where dataset_code = 'cvm_offers';

  if v_candidate_events = 0 then
    return;
  end if;

  if v_active_runs > 0 then
    raise exception 'legacy CVM canary cleanup aborted: active ingestion run';
  end if;

  if v_signals > 0 or v_linked_events > 0 then
    raise exception 'legacy CVM canary cleanup aborted: business lineage exists';
  end if;

  if v_candidate_events > 5000 then
    raise exception 'legacy CVM canary cleanup aborted: candidate volume % exceeds safety limit', v_candidate_events;
  end if;

  delete from public.capital_market_resource_checkpoints
  where dataset_code = 'cvm_offers';

  delete from public.bronze_historical_records
  where dataset_code = 'cvm_offers';

  delete from public.capital_market_events
  where dataset_code = 'cvm_offers';
end $$;
