-- Trigger helpers are internal implementation details and must not be exposed as RPCs.
revoke execute on function public.align_score_snapshot_with_public_evidence() from public,anon,authenticated;
revoke execute on function public.apply_factor_map_lead_adjustments() from public,anon,authenticated;
revoke execute on function public.apply_public_evidence_lead_guardrails() from public,anon,authenticated;
revoke execute on function public.capture_signal_factor_observations() from public,anon,authenticated;
revoke execute on function public.enrich_qualification_with_factor_map() from public,anon,authenticated;
revoke execute on function public.enrich_qualification_with_public_evidence() from public,anon,authenticated;
revoke execute on function public.guard_pipeline_with_public_evidence() from public,anon,authenticated;
revoke execute on function public.refresh_company_factor_snapshots(uuid,date) from public,anon,authenticated;
revoke execute on function public.sync_factor_map_patterns() from public,anon,authenticated;
revoke execute on function public.sync_factor_map_pipeline_and_tasks() from public,anon,authenticated;
revoke execute on function public.sync_public_evidence_patterns() from public,anon,authenticated;
revoke execute on function public.sync_public_evidence_pipeline_and_tasks() from public,anon,authenticated;
revoke execute on function public.sync_strategic_dataset_company_signals(text) from public,anon,authenticated;

grant execute on function public.refresh_company_factor_snapshots(uuid,date) to service_role;
grant execute on function public.sync_strategic_dataset_company_signals(text) to service_role;

alter function public.safe_numeric(text) set search_path=public;
