import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

// Recovery-only auditor. Not part of the application runtime. Never print raw
// source identifiers, URLs, company identifiers or evidence payloads.
const codeKey = value => String(value ?? '').trim().toLowerCase();
const idKey = value => String(value ?? '').trim().toLowerCase();
const typeKey = value => String(value ?? '').trim().toLowerCase();
const httpsHost = value => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch { return ''; }
};
const countBy = (rows, extract) => {
  const counts = new Map();
  for (const row of rows) {
    const key = extract(row);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};
const count = value => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/.test(value)) {
    const number = Number(value);
    if (Number.isSafeInteger(number)) return number;
  }
  return null;
};

export const AUDITED_REFERENCE_TABLES = Object.freeze([
  'monitoring_outputs', 'company_signals', 'source_connector_runs',
]);

export function evaluateSourceReferencePreflight(source, destination) {
  assert.ok(Array.isArray(source?.sources) && Array.isArray(destination?.sources),
    'Both source catalogues are required');
  assert.ok(source.references && typeof source.references === 'object',
    'Grouped legacy source references required');
  const old = source.sources, current = destination.sources;
  const oldCodes = countBy(old, x => codeKey(x.code));
  const currentCodes = countBy(current, x => codeKey(x.code));
  const oldIds = countBy(old, x => idKey(x.id));
  const currentIds = countBy(current, x => idKey(x.id));
  const destinationByCode = new Map(current.map(x => [codeKey(x.code), x]));
  const destinationById = new Map(current.map(x => [idKey(x.id), x]));
  const status = {
    missingCodeOrId: 0, duplicateSourceCodeOrId: 0, duplicateDestinationCodeOrId: 0,
    unmatchedCode: 0, uuidIdentityConflict: 0, contractMismatch: 0,
    insufficientContractEvidence: 0, technicalCandidate: 0,
  };
  const candidates = new Set();
  for (const item of old) {
    const id = idKey(item.id), code = codeKey(item.code);
    if (!id || !code) { status.missingCodeOrId++; continue; }
    if (oldCodes.get(code) !== 1 || oldIds.get(id) !== 1) {
      status.duplicateSourceCodeOrId++; continue;
    }
    const target = destinationByCode.get(code);
    if (!target) { status.unmatchedCode++; continue; }
    const targetId = idKey(target.id);
    if (!targetId || currentCodes.get(code) !== 1 || currentIds.get(targetId) !== 1) {
      status.duplicateDestinationCodeOrId++; continue;
    }
    const occupied = destinationById.get(id);
    if (occupied && codeKey(occupied.code) !== code) {
      status.uuidIdentityConflict++; continue;
    }
    const sourceHost = httpsHost(item.url), targetHost = httpsHost(target.url);
    const sourceType = typeKey(item.source_type), targetType = typeKey(target.source_type);
    if (!sourceHost || !targetHost || !sourceType || !targetType) {
      status.insufficientContractEvidence++; continue;
    }
    if (sourceHost !== targetHost || sourceType !== targetType) {
      status.contractMismatch++; continue;
    }
    status.technicalCandidate++;
    candidates.add(id);
  }
  assert.equal(Object.values(status).reduce((a, n) => a + n, 0), old.length,
    'Every legacy source must have one classification');
  const references = {};
  for (const table of AUDITED_REFERENCE_TABLES) {
    const rows = source.references[table];
    assert.ok(Array.isArray(rows), 'Missing grouped references for ' + table);
    const record = {totalRows: 0, technicalCandidateOnly: 0,
      manualReviewOrUnmapped: 0, unassignedSource: 0, invalidCounters: 0};
    for (const row of rows) {
      const amount = count(row.rows);
      if (amount === null) {record.invalidCounters++; continue;}
      assert.ok(Number.isSafeInteger(record.totalRows + amount),
        'Count overflow for ' + table);
      record.totalRows += amount;
      if (!idKey(row.id)) record.unassignedSource += amount;
      else if (candidates.has(idKey(row.id))) record.technicalCandidateOnly += amount;
      else record.manualReviewOrUnmapped += amount;
    }
    assert.equal(record.totalRows,
      record.technicalCandidateOnly + record.manualReviewOrUnmapped + record.unassignedSource);
    references[table] = record;
  }
  return {
    schema: 'motor.source-reference-readonly-preflight.v1',
    status: 'blocked_pending_legal_identity_and_lineage_review',
    readOnly: true, mappingApproved: false, signalImportAllowed: false,
    cutoverApproved: false, sourceCatalogues: {
      legacy: old.length, destination: current.length,
      destinationOnlyCodes: [...currentCodes.keys()].filter(key => !oldCodes.has(key)).length,
      sameCodeDifferentUuid: old.filter(x => {
        const target = destinationByCode.get(codeKey(x.code));
        return target && idKey(x.id) !== idKey(target.id);
      }).length,
      ...status,
    },
    references,
    warnings: [
      'Shared source code, HTTPS hostname and source type are candidate evidence only, never human approval.',
      'Source UUID remapping must preserve company, document, run and monitoring references.',
      'Company legal identity, test-data contamination and source contract review remain separate blocking gates.',
    ],
  };
}

async function inspect(url, withReferences) {
  const {default: pg} = await import('pg');
  const client = new pg.Client({connectionString: url, connectionTimeoutMillis: 10000,
    statement_timeout: 20000, application_name: 'motor-source-reference-readonly'});
  await client.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const sources = (await client.query(
      "SELECT id::text AS id, metadata->>'code' AS code, " +
      "coalesce(nullif(btrim(url),''), nullif(btrim(metadata->>'baseUrl'),'')) AS url, " +
      "source_type FROM public.source_catalog" )).rows;
    const references = {};
    if (withReferences) for (const table of AUDITED_REFERENCE_TABLES) {
      references[table] = (await client.query(
        'SELECT source_id::text AS id, count(*)::bigint AS rows FROM public.' + table + ' GROUP BY source_id'
      )).rows;
    }
    await client.query('COMMIT');
    return {sources, references};
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally { await client.end(); }
}

export async function auditSourceReferencePreflight(supabaseUrl, neonUrl) {
  const {assertAuditConnections} = await import('./data-plane-cutover-inventory.mjs');
  assertAuditConnections(supabaseUrl, neonUrl);
  const [source, destination] = await Promise.all([
    inspect(supabaseUrl, true), inspect(neonUrl, false),
  ]);
  return evaluateSourceReferencePreflight(source, destination);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await auditSourceReferencePreflight(
      process.env.MOTOR_SUPABASE_AUDIT_DATABASE_URL,
      process.env.MOTOR_NEON_DATABASE_URL,
    );
    console.log(JSON.stringify(result, null, 2)); // Aggregates only.
    process.exitCode = 2; // Intentionally never approves historical import.
  } catch {
    console.error('Source reference preflight failed closed. Check authorized database access.');
    process.exitCode = 1;
  }
}
