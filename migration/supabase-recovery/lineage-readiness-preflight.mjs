import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { assertAuditConnections } from './data-plane-cutover-inventory.mjs';

// Do not import this into the active runtime. Reconciliation is offline only.
// Raw CNPJs, source codes, and UUIDs remain in memory and are NEVER serialized.
export const DEPENDENCIES = Object.freeze({
  monitoring_outputs: Object.freeze(['company_id', 'source_id']),
  company_signals: Object.freeze(['company_id', 'source_id']),
  source_connector_runs: Object.freeze(['company_id', 'source_id']),
  qualification_snapshots: Object.freeze(['company_id']),
  score_snapshots: Object.freeze(['company_id']),
  lead_score_snapshots: Object.freeze(['company_id']),
  pipeline: Object.freeze(['company_id']),
});

const normalizeId = value => String(value ?? '').trim().toLowerCase();
const normalizeCode = value => String(value ?? '').trim().toLowerCase();
const normalizeCnpj = value => String(value ?? '').replace(/\D/g, '');
const companyKey = value => {
  const code = normalizeCnpj(value);
  return code.length === 14 && !/^(\d)\1{13}$/.test(code) ? code : '';
};

const countValues = values => {
  const map = new Map();
  for (const value of values) if (value) map.set(value, (map.get(value) ?? 0) + 1);
  return map;
};

const sum = entries => entries.reduce((total, entry) => total + Number(entry.rows), 0);

export const evaluateLineageCoverage = (supabase, neon) => {
  assert.ok(Array.isArray(supabase?.companies) && Array.isArray(neon?.companies), 'Missing company parents');
  assert.ok(Array.isArray(supabase?.sources) && Array.isArray(neon?.sources), 'Missing source parents');
  assert.ok(supabase?.references && typeof supabase.references === 'object', 'Missing source references');
  const parents = {
    company_id: {
      source: new Map(supabase.companies.map(row => [normalizeId(row.id), companyKey(row.cnpj)])),
      target: countValues(neon.companies.map(row => companyKey(row.cnpj))),
    },
    source_id: {
      source: new Map(supabase.sources.map(row => [normalizeId(row.id), normalizeCode(row.code)])),
      target: countValues(neon.sources.map(row => normalizeCode(row.code))),
    },
  };
  const comparisons = [];
  for (const [table, columns] of Object.entries(DEPENDENCIES)) {
    for (const column of columns) {
      const list = supabase.references[table]?.[column];
      assert.ok(Array.isArray(list), 'Missing dependency coverage input for ' + table + '.' + column);
      const indexed = parents[column];
      const stats = {
        table, reference: column, referencedRows: sum(list),
        mappableByUniqueNaturalKey: 0, missingSourceParent: 0,
        missingParentNaturalKey: 0, unmatchedTargetKey: 0,
        ambiguousTargetKey: 0, invalidCountRows: 0,
      };
      for (const row of list) {
        const number = Number(row.rows);
        if (!Number.isSafeInteger(number) || number < 0) {
          stats.invalidCountRows++;
          continue;
        }
        const id = normalizeId(row.id);
        if (!indexed.source.has(id)) {
          stats.missingSourceParent += number;
          continue;
        }
        const naturalKey = indexed.source.get(id);
        if (!naturalKey) {
          stats.missingParentNaturalKey += number;
          continue;
        }
        const candidates = indexed.target.get(naturalKey) ?? 0;
        if (candidates === 1) stats.mappableByUniqueNaturalKey += number;
        else if (candidates === 0) stats.unmatchedTargetKey += number;
        else stats.ambiguousTargetKey += number;
      }
      stats.mappedOnlyInTheory = true;
      stats.parentRemapRequired = true;
      stats.complete = stats.invalidCountRows === 0
        && stats.referencedRows === stats.mappableByUniqueNaturalKey;
      comparisons.push(stats);
    }
  }
  return {
    schema: 'motor.lineage-readonly-coverage.v1',
    status: 'blocked_pending_id_maps_and_reviewed_restore',
    readOnly: true, importAllowed: false, cutoverApproved: false,
    comparisons,
    allKnownParentReferencesMappable: comparisons.every(item => item.complete),
    unmappedCompanyRows: comparisons.filter(x => x.reference === 'company_id')
      .reduce((count, item) => count + item.referencedRows - item.mappableByUniqueNaturalKey, 0),
    unmappedSourceRows: comparisons.filter(x => x.reference === 'source_id')
      .reduce((count, item) => count + item.referencedRows - item.mappableByUniqueNaturalKey, 0),
    excludedRelationsRequiringSeparateMapping: [
      'search_profiles UUID/text and search_profile_runs',
      'source_connector_runs -> monitoring_outputs.run_id absent in historical Supabase',
      'company_signals.monitoring_output_id and pattern_catalog references',
      'source_documents, reviews, Auth identities and pipeline owners',
    ],
    warnings: [
      'Natural-key match is diagnostic only; it is NOT a verified mapping or authorization to copy.',
      'No synthetic run_id, source URL, credit approval or user can be backfilled from aggregate counts.',
      'Preserve all source database rows and test both FK and checksum parity on an isolated branch.',
    ],
  };
};

const requirePgIdentifier = value => {
  assert.match(value, /^[a-z][a-z0-9_]*$/, 'Invalid preflight identifier');
  return '"' + value + '"';
};

const inspect = async (url, includeReferences) => {
  const client = new pg.Client({
    connectionString: url, connectionTimeoutMillis: 10_000, statement_timeout: 20_000,
    application_name: 'motor-readonly-source-lineage-coverage',
  });
  await client.connect();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    const companies = (await client.query('select id::text id, cnpj from public.companies')).rows;
    const sources = (await client.query(
      "select id::text id, metadata->>'code' code from public.source_catalog")).rows;
    const references = {};
    if (includeReferences) for (const [table, columns] of Object.entries(DEPENDENCIES)) {
      references[table] = {};
      for (const column of columns) {
        const sql = 'select ' + requirePgIdentifier(column) + '::text id, count(*)::integer rows '
          + 'from public.' + requirePgIdentifier(table) + ' where '
          + requirePgIdentifier(column) + ' is not null group by 1';
        references[table][column] = (await client.query(sql)).rows;
      }
    }
    await client.query('COMMIT');
    return { companies, sources, references };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
};

export const auditLineageCoverage = async (supabaseUrl, neonUrl) => {
  assertAuditConnections(supabaseUrl, neonUrl);
  const [supabase, neon] = await Promise.all([
    inspect(supabaseUrl, true), inspect(neonUrl, false),
  ]);
  return evaluateLineageCoverage(supabase, neon);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await auditLineageCoverage(
      process.env.MOTOR_SUPABASE_AUDIT_DATABASE_URL,
      process.env.MOTOR_NEON_DATABASE_URL,
    );
    // Counts and logical dependency names only. No source/business identifiers.
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 2; // Intentionally fail-closed until signed cutover.
  } catch (error) {
    // Provider error details can contain a SQL fragment; avoid displaying inputs.
    console.error('Read-only lineage audit failed; check connection/schema via authorized logs.');
    process.exitCode = 1;
  }
}
