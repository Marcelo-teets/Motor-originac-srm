// Reviewed release allowlist for the V5 cutover. Never apply unreviewed DDL.
export const APPROVED_V5_PENDING_MIGRATIONS = Object.freeze([
  'db/neon/20261009_neon_cvm_fre_headcount_sync.sql',
  'db/neon/20261009_neon_cvm_candidate_role_consistency.sql',
  'db/neon/20261011_neon_bronze_duplicate_ref_index_cleanup.sql',
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
