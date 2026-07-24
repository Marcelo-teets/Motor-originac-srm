-- Candidate synchronization is part of explicit capital-market delivery.
-- Running it inside the dataset status update held the run row lock and caused
-- statement timeouts on otherwise successful ingestions.

drop trigger if exists trg_capital_market_run_candidates
  on public.capital_market_dataset_runs;

comment on function public.trigger_sync_capital_market_discovered_candidates() is
  'Legacy function retained for rollback compatibility. Candidate synchronization is executed explicitly by sync_capital_market_delivery for cvm_offers.';
