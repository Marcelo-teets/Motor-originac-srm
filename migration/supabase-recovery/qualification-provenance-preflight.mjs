import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

// Audit-only: never import snapshots, infer human approval or expose business rows.
// The read-only SQL intentionally emits aggregates, not IDs, CNPJs or payloads.
const AGGREGATE_SQL = `
SELECT count(*)::bigint AS total,
       count(DISTINCT q.company_id)::bigint AS distinct_companies,
       count(*) FILTER (WHERE q.company_id IS NULL OR c.id IS NULL)::bigint AS orphan_company_refs,
       count(*) FILTER (WHERE lower(trim(coalesce(q.created_by, ''))) IN
         ('capture_derived_sync', 'material_trigger_engine'))::bigint AS known_automated,
       count(*) FILTER (WHERE nullif(trim(coalesce(q.created_by, '')), '') IS NULL)::bigint AS unattributed,
       count(*) FILTER (WHERE nullif(trim(coalesce(q.created_by, '')), '') IS NOT NULL
         AND lower(trim(q.created_by)) NOT IN
         ('capture_derived_sync', 'material_trigger_engine'))::bigint AS other_unverified,
       count(*) FILTER (WHERE q.evidence IS NOT NULL OR q.evidence_payload IS NOT NULL)::bigint AS evidence_present,
       count(*) FILTER (WHERE q.total_score IS NOT NULL OR q.qualification_score_total IS NOT NULL)::bigint AS score_present
FROM public.qualification_snapshots q
LEFT JOIN public.companies c ON c.id = q.company_id`;

const fields = Object.freeze([
  'total', 'distinct_companies', 'orphan_company_refs', 'known_automated',
  'unattributed', 'other_unverified', 'evidence_present', 'score_present',
]);

export function normalizeAggregate(row) {
  assert.ok(row && typeof row === 'object', 'Missing qualification aggregate');
  const values = Object.fromEntries(fields.map(field => {
    const value = Number(row[field]);
    assert.ok(Number.isSafeInteger(value) && value >= 0,
      `Invalid nonnegative integer aggregate: ${field}`);
    return [field, value];
  }));
  assert.equal(values.known_automated + values.unattributed + values.other_unverified,
    values.total, 'Provenance categories must partition all snapshots');
  for (const field of fields.slice(1)) {
    assert.ok(values[field] <= values.total, `Aggregate exceeds total: ${field}`);
  }
  return Object.freeze({
    total: values.total,
    distinctCompanies: values.distinct_companies,
    orphanCompanyReferences: values.orphan_company_refs,
    knownAutomated: values.known_automated,
    unattributed: values.unattributed,
    otherUnverified: values.other_unverified,
    evidencePresent: values.evidence_present,
    scorePresent: values.score_present,
  });
}

export function evaluateQualificationProvenance(source, target) {
  return {
    schema: 'motor.qualification-provenance-readonly.v1',
    status: 'blocked_pending_identity_lineage_mapping_and_human_review',
    readOnly: true,
    cutoverApproved: false,
    historicalSnapshotsAcceptedAsHumanReviews: false,
    supabase: normalizeAggregate(source),
    neon: normalizeAggregate(target),
    cautions: [
      'An evidence field or numerical score does not prove human review.',
      'Unknown or blank created_by is unverified, never human-approved.',
      'Company IDs and source lineage must be reconciled before any import.',
      'This report cannot authorize cutover, dual-write or credit approval.',
    ],
  };
}

async function inspect(url, applicationName) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 10000,
    statement_timeout: 15000,
    application_name: applicationName,
  });
  await client.connect();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    const { rows } = await client.query(AGGREGATE_SQL);
    await client.query('COMMIT');
    return rows[0];
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

export async function auditQualificationProvenance(supabaseUrl, neonUrl) {
  const { assertAuditConnections } = await import('./data-plane-cutover-inventory.mjs');
  assertAuditConnections(supabaseUrl, neonUrl);
  const [source, target] = await Promise.all([
    inspect(supabaseUrl, 'motor-legacy-qualification-readonly'),
    inspect(neonUrl, 'motor-neon-qualification-readonly'),
  ]);
  return evaluateQualificationProvenance(source, target);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await auditQualificationProvenance(
      process.env.MOTOR_SUPABASE_AUDIT_DATABASE_URL,
      process.env.MOTOR_NEON_DATABASE_URL,
    );
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 2; // Audit always fails closed; never authorizes import.
  } catch {
    console.error('Qualification provenance audit failed; verify authorized database access.');
    process.exitCode = 1;
  }
}
