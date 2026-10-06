import { readFileSync } from 'node:fs';
import pg from 'pg';
import { findUnsupportedSql, toNeonSql } from './lib/neon-sql-compat.mjs';
import { applyMigrationPatches } from './lib/neon-migration-patches.mjs';

const connectionString = process.env.MOTOR_NEON_DATABASE_URL || process.env.DATABASE_URL || '';
if (!connectionString) throw new Error('MOTOR_NEON_DATABASE_URL or DATABASE_URL is required.');

const migrations = [
  'db/neon/20261005_neon_runtime_roles.sql',
  'db/migrations/035_capital_market_public_data.sql',
  'db/migrations/036_capital_market_dataset_runs_source_index.sql',
  'db/migrations/037_capital_market_incremental_checkpoints.sql',
  'db/migrations/044_capital_market_ingestion_health.sql',
  'db/migrations/060_origination_knowledge_vault.sql',
  'db/neon/20261005_neon_qualification_compatibility.sql',
  'db/neon/20261005_neon_signal_compatibility.sql',
  'db/neon/20260928_neon_uuid_extended_runtime.sql',
  'db/neon/20260928_neon_origination_intelligence_modules.sql',
  'db/neon/20261006_neon_legacy_runtime_objects.sql',
  'db/neon/20260928_neon_match_vector_documents.sql',
  'db/migrations/019_capture_treatment_runtime_alignment.sql',
  'db/migrations/020_runtime_capture_repository_alignment.sql',
  'db/migrations/020_origination_operating_system.sql',
  'db/migrations/021_rss_source_expansion.sql',
  'db/migrations/022_data_platform_d0_d1_foundation.sql',
  'db/migrations/023_data_quality_gates_minimum.sql',
  'db/migrations/024_mais_retorno_usage_tables.sql',
  'db/migrations/025_reserve_external_api_request.sql',
  'db/migrations/026_seed_mais_retorno_source.sql',
  'db/migrations/029_non_obvious_sources_capture_treatment.sql',
  'db/migrations/030_source_treatment_impact_views.sql',
  'db/migrations/031_linkedin_media_source_expansion.sql',
  'db/migrations/033_ranking_v2_persistence.sql',
  'db/migrations/034_ranking_v2_live_schema.sql',
  'db/migrations/032_company_signals_source_lineage_backfill.sql',
  'db/migrations/043_capital_market_single_running_guard.sql',
  'db/migrations/044_cvm_capture_inbox_candidates.sql',
  'db/migrations/045_repair_cvm_capture_inbox_candidate_sync.sql',
  'db/migrations/046_company_discovery_links_live_schema.sql',
  'db/migrations/047_normalize_cvm_candidate_contract.sql',
  'db/migrations/048_b2b_scraper_fidc_source_expansion.sql',
  'db/migrations/049_bcb_sgs_macro_treatment.sql',
  'db/migrations/050_public_records_api_sources.sql',
  'db/migrations/051_vc_portfolio_monitor_activation.sql',
  'db/migrations/052_open_finance_participants_api_source.sql',
  'db/migrations/053_reconcile_bcb_vc_source_foundation.sql',
  'db/migrations/054_free_official_data_sources.sql',
  'db/migrations/055_reconcile_free_official_source_registry.sql',
  'db/migrations/056_free_source_evidence_guardrails.sql',
  'db/migrations/057_public_bulk_ingestion.sql',
  'db/migrations/058_public_bulk_signal_sync.sql',
  'db/migrations/059_public_data_operations_snapshot.sql',
  'db/migrations/060_public_evidence_intelligence.sql',
  'db/migrations/061_public_qualification_patterns.sql',
  'db/migrations/062_public_score_lead_guardrails.sql',
  'db/migrations/063_public_pipeline_ranking.sql',
  'db/migrations/064_score_compatibility_columns.sql',
  'db/migrations/065_strategic_source_governance.sql',
  'db/migrations/066_origination_factor_map_schema.sql',
  'db/migrations/067_strategic_record_signal_sync.sql',
  'db/migrations/068_factor_map_runtime.sql',
  'db/migrations/069_factor_qualification_integration.sql',
  'db/migrations/070_factor_pattern_integration.sql',
  'db/migrations/071_factor_lead_pipeline_integration.sql',
  'db/migrations/072_factor_outcome_map.sql',
  'db/migrations/073_factor_map_backfill.sql',
  'db/migrations/074_factor_map_dedup_calibration.sql',
  'db/migrations/075_factor_map_security_hardening.sql',
  'db/migrations/076_factor_map_foreign_key_indexes.sql',
  'db/migrations/077_strategic_source_runtime_governance.sql',
  'db/migrations/078_strategic_source_probe_status.sql',
  'db/neon/20261006_neon_pipeline_compatibility.sql',
  'db/migrations/076_knowledge_company_workspace.sql',
  'db/migrations/077_knowledge_vault_function_grants_hardening.sql',
  'db/migrations/078_knowledge_capture_concurrency_lock.sql',
  'db/migrations/082_knowledge_saved_views_bases.sql',
  'db/migrations/083_knowledge_monitoring_output_capture.sql',
  'db/neon/20261006_neon_crm_execution_compatibility.sql',
  'db/migrations/085_knowledge_execution_actions.sql',
  'db/migrations/086_knowledge_execution_reference_validation.sql',
  'db/migrations/087_knowledge_execution_completion_guard.sql',
  'db/migrations/088_knowledge_execution_result_lineage.sql',
  'db/migrations/089_knowledge_execution_context.sql',
  'db/migrations/090_knowledge_execution_outcome_views.sql',
  'db/migrations/091_factor_outcome_map_v2.sql',
  'db/migrations/092_knowledge_outcome_intelligence_rpc.sql',
  'db/migrations/093_company_master_decision_quality_gate.sql',
  'db/migrations/094_company_decision_write_guards.sql',
  'db/migrations/095_company_decision_readiness_snapshot.sql',
  'db/migrations/096_candidate_identity_quality_gate.sql',
  'db/migrations/097_candidate_eligible_company_link_gate.sql',
  'db/migrations/098_candidate_identity_trigger_security.sql',
  'db/migrations/093_knowledge_outcome_operations.sql',
  'db/migrations/099_candidate_identity_review_workflow.sql',
  'db/migrations/100_fix_candidate_identity_review_generated_columns.sql',
  'db/migrations/101_fix_identity_domain_normalization.sql',
  'db/migrations/102_candidate_identity_reviews_explicit_deny_policy.sql',
  'db/migrations/094_knowledge_outcome_workbench.sql',
  'db/neon/20261006_neon_vector_corpus_compatibility.sql',
  'db/migrations/103_separate_entity_and_decision_eligibility.sql',
  'db/migrations/097_knowledge_hybrid_search_v9.sql',
  'db/migrations/092_cvm_delivery_hardening.sql',
  'db/migrations/096_qualification_score_semantics.sql',
  'db/migrations/098_knowledge_embedding_coverage_v10.sql',
  'db/migrations/099_knowledge_embedding_budget_baseline_fix.sql',
  'db/migrations/100_knowledge_embedding_vector_comparison_fix.sql',
  'db/migrations/101_knowledge_embedding_security_hardening.sql',
  'db/migrations/102_qsa_fallback_governance.sql',
  'db/migrations/103_qsa_fallback_idempotency.sql',
  'db/migrations/093_cvm_checkpoint_timestamp_contract.sql',
  'db/migrations/20260724152000_user_profiles_god_mode_auth_flows.sql',
  'db/migrations/20260724153500_user_access_security_invoker.sql',
  'db/migrations/20260724155000_fix_user_access_invoker_column_grants.sql',
  'db/migrations/20260724160500_harden_god_mode_direct_updates.sql',
  'db/migrations/104_finep_public_funding.sql',
  'db/migrations/105_finep_operations_panel_performance.sql',
  'db/migrations/106_anbima_public_source_governance.sql',
  'db/migrations/119_candidate_decision_queue.sql',
  'db/migrations/120_candidate_decision_queue_filter_hardening.sql',
  'db/migrations/121_candidate_decision_queue_calibration_v2.sql',
  'db/migrations/104_knowledge_learning_agent.sql',
  'db/migrations/105_knowledge_learning_agent_link_fix.sql',
  'db/migrations/106_knowledge_learning_agent_enqueue_rls.sql',
  'db/migrations/107_knowledge_learning_agent_pgcrypto_schema.sql',
  'db/migrations/122_candidate_cvm_company_registry.sql',
  'db/migrations/123_candidate_decision_queue_cvm_coverage_v3.sql',
  'db/migrations/124_candidate_cvm_registry_determinism.sql',
  'db/migrations/108_dcm_daily_outreach_operating_loop.sql',
  'db/migrations/109_dcm_daily_outreach_view_security.sql',
  'db/migrations/20260724195500_dcm_daily_outreach_rls_hardening.sql',
  'db/migrations/095_index_dcm_outreach_feedback_daily_lead.sql',
  'db/migrations/125_cvm_production_intelligence_foundation.sql',
  'db/migrations/126_cvm_production_intelligence_signals.sql',
  'db/migrations/127_cvm_production_intelligence_delivery_views.sql',
  'db/migrations/128_cvm_explicit_candidate_delivery.sql',
  'db/migrations/129_cvm_atomic_batch_persistence.sql',
  'db/migrations/108_company_credit_review_gate.sql',
  'db/migrations/109_filter_ranking_v2_by_decision_eligibility.sql',
  'db/migrations/110_align_credit_review_with_decision_engines.sql',
  'db/migrations/111_harden_credit_review_trigger_privileges.sql',
  'db/migrations/112_enforce_authenticated_credit_review_finalization.sql',
  'db/migrations/113_reclassify_empty_successful_capture_runs.sql',
  'db/migrations/114_quarantine_unattributed_credit_reviews.sql',
  'db/migrations/115_fix_knowledge_learning_service_role_detection.sql',
  'db/migrations/116_harden_pipeline_eligibility_surfaces.sql',
  'db/migrations/117_govern_knowledge_learning_queue.sql',
  'db/migrations/118_circuit_break_knowledge_provider_billing.sql',
  'db/migrations/119_harden_knowledge_learning_governance_security.sql',
  'db/migrations/20260727123000_harden_user_owned_data_rls.sql',
  'db/migrations/20260727123100_harden_vector_corpus_and_role_rpc.sql',
  'db/migrations/20260727123200_repair_company_signal_history.sql',
  'db/migrations/20260727123300_signal_quality_guardrails_and_score_identity.sql',
  'db/neon/20261005_neon_microsoft_runtime.sql',
  'db/neon/20261005_neon_archive_metadata.sql',
  'db/migrations/20260727173000_source_control_sheet_sync.sql',
  'db/migrations/130_cvm_batch_deduplicate_input.sql',
  'db/migrations/131_activate_bcb_sgs_credit_series.sql',
  'db/migrations/132_fidcs_source_and_catalog_governance.sql',
  'db/neon/20261006_neon_bronze_historical_compatibility.sql',
  'db/neon/20261006_neon_agentetome_base_compatibility.sql',
  'db/migrations/128_agentetome_production_control_plane.sql',
  'db/migrations/129_agentetome_current_snapshot_lineage.sql',
  'db/migrations/130_agentetome_runtime_current_vs_history.sql',
  'db/migrations/133_cvm_fund_documents_and_source_schedules.sql',
  'db/migrations/134_source_probe_schedule_alignment.sql',
  'db/migrations/135_source_schedule_registry_service_role_policy.sql',
  'db/migrations/136_cvm_free_tier_storage_guard.sql',
  'db/migrations/138_compact_existing_cvm_event_payloads.sql',
  'db/migrations/20260810232500_agfeed_source_governance.sql',
  'db/migrations/20260811235500_agfeed_search_discovery_schedule.sql',
  'db/migrations/20260812003000_optimize_candidate_event_uuid_join.sql',
  'db/migrations/20260812005500_backfill_identity_review_prefill.sql',
  'db/migrations/20260812011000_rss_operating_company_commercial_queue.sql',
  'db/migrations/20260812012500_rss_operating_company_commercial_queue_v2.sql',
  'db/migrations/20260812014500_rss_first_party_identity_seed.sql',
  'db/migrations/20260812053000_data_treatment_enrichment_v2.sql',
  'db/migrations/20260812021000_bull_media_alias_dedupe.sql',
  'db/migrations/20260812022500_bull_alias_reassert_after_semantics_v3.sql',
  'db/migrations/20260812024500_rss_first_party_identity_batch_v2.sql',
  'db/migrations/130_debentures_snd_source_catalog.sql',
  'db/migrations/131_debentures_snd_signal_treatment.sql',
  'db/migrations/132_debentures_snd_candidate_delivery.sql',
  'db/migrations/133_debentures_snd_delivery_whitelist.sql',
  'db/migrations/134_debentures_snd_cold_archive_policy.sql',
  'db/migrations/134_people_capital_intelligence.sql',
  'db/migrations/135_people_capital_job_history_guard.sql',
  'db/migrations/136_people_capital_vault_ui_compat.sql',
  'db/migrations/137_people_capital_hiring_mix.sql',
  'db/migrations/139_origination_intelligence_brief.sql',
  'db/migrations/138_people_capital_candidate_promotion_graph.sql',
  'db/migrations/140_origination_brief_real_company_gate.sql',
  'db/migrations/141_universal_origination_reasoning_v2.sql',
  'db/migrations/142_universal_origination_reasoning_calibration.sql',
  'db/migrations/143_universal_origination_reasoning_conflict_resolution.sql',
  'db/migrations/144_origination_reprocessing_queue.sql',
  'db/migrations/145_origination_reprocessing_schedule.sql',
  'db/migrations/146_automatic_candidate_entity_resolution.sql',
  'db/migrations/147_origination_entity_eligibility_gate.sql',
  'db/migrations/148_operating_issuer_resolution_and_analytics_fix.sql',
  'db/migrations/149_candidate_entity_resolution_v3.sql',
  'db/migrations/150_candidate_entity_resolution_v4.sql',
  'db/migrations/151_candidate_entity_resolution_v5_conflict_constraint.sql',
  'db/migrations/152_regulated_issuer_identity_calibration.sql',
  'db/migrations/145_entity_relevance_v3_historical_remediation.sql',
];


const pool = new pg.Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 10000,
  statement_timeout: 120000,
  application_name: 'motor-neon-runtime-migrator',
});
const client = await pool.connect();

try {
  await client.query('create schema if not exists private');
  await client.query(
    "create table if not exists private.motor_neon_migrations (" +
    "migration_key text primary key," +
    "applied_at timestamptz not null default now()," +
    "git_sha text," +
    "metadata jsonb not null default '{}'::jsonb" +
    ")"
  );

  for (const file of migrations) {
    const done = await client.query(
      'select 1 from private.motor_neon_migrations where migration_key=$1',
      [file],
    );
    if (done.rowCount) {
      console.log('skip', file);
      continue;
    }

    const source = readFileSync(file, 'utf8');
    const unsupported = findUnsupportedSql(source);
    if (unsupported.length) {
      console.error('failed', file, `unsupported on Neon: ${unsupported.join('; ')}`);
      process.exitCode = 1;
      break;
    }
    const sql = toNeonSql(applyMigrationPatches(file, source));
    console.log('apply', file);
    try {
      await client.query('begin');
      await client.query("set local lock_timeout='10s'");
      await client.query("set local statement_timeout='120s'");
      await client.query(sql);
      await client.query(
        'insert into private.motor_neon_migrations(migration_key,git_sha,metadata) values($1,$2,$3::jsonb)',
        [file, process.env.GITHUB_SHA || null, JSON.stringify({ wave: 'runtime-core-20261005' })],
      );
      await client.query('commit');
      console.log('ok', file);
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      console.error('failed', file, error instanceof Error ? error.message : error);
      process.exitCode = 1;
      break;
    }
  }
} finally {
  client.release();
  await pool.end();
}
