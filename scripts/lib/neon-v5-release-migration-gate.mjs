// Reviewed release allowlist for the V5 cutover. Never apply unreviewed DDL.
export const APPROVED_V5_PENDING_MIGRATIONS = Object.freeze([
  'db/neon/20261009_neon_cvm_fre_headcount_sync.sql',
  'db/neon/20261009_neon_cvm_candidate_role_consistency.sql',
  'db/neon/20261011_neon_bronze_duplicate_ref_index_cleanup.sql',
  'db/neon/20261013_neon_fidc_assignor_identity_queue_v5.sql',
  'db/neon/20261013_neon_fidc_assignor_registry_identity_v5.sql',
  'db/neon/20261013_neon_fidc_registry_provider_fallback.sql',
  'db/neon/20261013_neon_fidc_cnpjws_publica_third_provider.sql',
  'db/neon/20261013_neon_vc_portfolio_unverified_icp_backfill.sql',
  'db/neon/20261014_neon_fidc_commercial_review_v5.sql',
  'db/neon/20261019_neon_fidc_assignor_human_review_log_v5.sql',
  'db/neon/20261019_neon_first_party_credit_research_candidates_v5.sql',
  'db/neon/20261019_neon_official_credit_diligence_a2.sql',
  'db/neon/20261019_neon_a2_human_identity_autoresolver_guard.sql',
  'db/neon/20261022_neon_jeitto_first_party_credit_candidate_a2.sql',
  'db/neon/20261026_neon_credit_review_finalization_evidence_guard.sql',
]);

export const verifyApprovedNeonPendingMigrations = ({
  planned,
  applied,
  approved = APPROVED_V5_PENDING_MIGRATIONS,
}) => {
  if (!Array.isArray(planned) || !Array.isArray(applied)) {
    throw new Error('Neon migration plan and ledger must be arrays.');
  }
  const approvedSet = new Set(approved);
  const pending = planned.filter((migration) => !new Set(applied).has(migration));
  const unexpected = pending.filter((migration) => !approvedSet.has(migration));
  if (unexpected.length) {
    throw new Error(`Refusing deployment: unapproved Neon migrations pending: ${unexpected.join(', ')}`);
  }
  return pending;
};
