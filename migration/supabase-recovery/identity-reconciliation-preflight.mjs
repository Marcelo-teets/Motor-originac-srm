import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { assertAuditConnections } from './data-plane-cutover-inventory.mjs';

// Identity-only, read-only comparison. Business identifiers never leave this
// process; the emitted result contains counts and gates, not CNPJ, UUID or email.
const corporateTaxId = (input) => {
  const value = String(input ?? '').replace(/\D/g, '');
  return value.length === 14 && !/^(\d)\1{13}$/.test(value) ? value : null;
};
const key = (input) => typeof input === 'string' ? input.trim().toLowerCase() : '';
const id = (input) => typeof input === 'string' ? input.trim().toLowerCase() : '';

const indexRows = (rows, field) => {
  const indexed = new Map();
  for (const row of rows) {
    const value = row[field];
    if (!value) continue;
    if (!indexed.has(value)) indexed.set(value, []);
    indexed.get(value).push(row);
  }
  return indexed;
};
const duplicateGroups = (indexed) => [...indexed.values()].filter(group => group.length > 1).length;

export const evaluateIdentityReconciliation = (supabase, neon) => {
  for (const value of [supabase, neon]) {
    assert.ok(Array.isArray(value?.companies), 'Expected company identity rows');
    assert.ok(Array.isArray(value?.sources), 'Expected source identity rows');
  }
  const companies = (db) => db.companies.map(row => ({
    id: id(row.id), cnpj: corporateTaxId(row.cnpj),
  }));
  const sources = (db) => db.sources.map(row => ({
    id: id(row.id), code: key(row.code),
  }));
  const oldCompanies = companies(supabase), activeCompanies = companies(neon);
  const oldSources = sources(supabase), activeSources = sources(neon);
  const oldCompanyCnpjs = indexRows(oldCompanies, 'cnpj');
  const activeCompanyCnpjs = indexRows(activeCompanies, 'cnpj');
  const oldCompanyIds = indexRows(oldCompanies, 'id');
  const activeCompanyIds = indexRows(activeCompanies, 'id');
  const oldSourceCodes = indexRows(oldSources, 'code');
  const activeSourceCodes = indexRows(activeSources, 'code');
  const oldSourceIds = indexRows(oldSources, 'id');
  const activeSourceIds = indexRows(activeSources, 'id');

  const matchedCnpjs = [...oldCompanyCnpjs.keys()].filter(value => activeCompanyCnpjs.has(value));
  const matchedCompanyIds = [...oldCompanyIds.keys()].filter(value => activeCompanyIds.has(value));
  const matchedSourceCodes = [...oldSourceCodes.keys()].filter(value => activeSourceCodes.has(value));
  const matchedSourceIds = [...oldSourceIds.keys()].filter(value => activeSourceIds.has(value));
  const cnpjMatchedWithDifferentId = matchedCnpjs.filter(value => {
    const sourceIds = new Set(oldCompanyCnpjs.get(value).map(row => row.id));
    return activeCompanyCnpjs.get(value).some(row => !sourceIds.has(row.id));
  }).length;
  const companyIdMatchedWithDifferentCnpj = matchedCompanyIds.filter(value => {
    const sourceCnpjs = new Set(oldCompanyIds.get(value).map(row => row.cnpj));
    return activeCompanyIds.get(value).some(row => !sourceCnpjs.has(row.cnpj));
  }).length;
  const sourceCodeMatchedWithDifferentId = matchedSourceCodes.filter(value => {
    const sourceIds = new Set(oldSourceCodes.get(value).map(row => row.id));
    return activeSourceCodes.get(value).some(row => !sourceIds.has(row.id));
  }).length;

  const result = {
    schema: 'motor.identity-preflight.aggregate.v1',
    mode: 'two-database-read-only',
    cutoverApproved: false,
    importAllowed: false,
    status: 'blocked_pending_mapping_backups_and_human_signoff',
    companies: {
      supabase: oldCompanies.length, neon: activeCompanies.length,
      matchedCnpj: matchedCnpjs.length, matchedUuid: matchedCompanyIds.length,
      matchedCnpjDifferentUuid: cnpjMatchedWithDifferentId,
      matchedUuidDifferentCnpj: companyIdMatchedWithDifferentCnpj,
      missingOrInvalidCnpj: {
        supabase: oldCompanies.filter(row => !row.cnpj).length,
        neon: activeCompanies.filter(row => !row.cnpj).length,
      },
      duplicateCnpjGroups: {
        supabase: duplicateGroups(oldCompanyCnpjs),
        neon: duplicateGroups(activeCompanyCnpjs),
      },
    },
    sources: {
      supabase: oldSources.length, neon: activeSources.length,
      matchedCode: matchedSourceCodes.length, matchedUuid: matchedSourceIds.length,
      matchedCodeDifferentUuid: sourceCodeMatchedWithDifferentId,
      missingCode: {
        supabase: oldSources.filter(row => !row.code).length,
        neon: activeSources.filter(row => !row.code).length,
      },
      duplicateCodeGroups: {
        supabase: duplicateGroups(oldSourceCodes),
        neon: duplicateGroups(activeSourceCodes),
      },
    },
    requiredBeforeImport: [
      'Create reviewed source_catalog ID map by canonical metadata.code and preserve run/source lineage.',
      'Resolve company IDs by validated CNPJ, including duplicate/reused/missing identifiers.',
      'Map search_profiles UUID/text IDs and owner/Auth identities without assuming continuity.',
      'Back up BOTH databases; stage on an isolated branch and validate FK/row-count/checksum parity.',
      'Require human approval of legal identity, finance evidence and reversible production cutover.',
    ],
  };
  return result;
};

const inspectReadOnly = async (url) => {
  const client = new pg.Client({
    connectionString: url, connectionTimeoutMillis: 10000, statement_timeout: 15000,
    application_name: 'motor-identity-cutover-read-only-preflight',
  });
  await client.connect();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    const companies = (await client.query('select id::text as id, cnpj from public.companies')).rows;
    const sources = (await client.query(
      "select id::text as id, metadata->>'code' as code from public.source_catalog")).rows;
    await client.query('COMMIT');
    return { companies, sources };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
};

export const inspectIdentityReconciliation = async (supabaseUrl, neonUrl) => {
  assertAuditConnections(supabaseUrl, neonUrl);
  const [supabase, neon] = await Promise.all([
    inspectReadOnly(supabaseUrl), inspectReadOnly(neonUrl),
  ]);
  return evaluateIdentityReconciliation(supabase, neon);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await inspectIdentityReconciliation(
      process.env.MOTOR_SUPABASE_AUDIT_DATABASE_URL,
      process.env.MOTOR_NEON_DATABASE_URL,
    );
    // Never print raw rows or URLs: reporting aggregate evidence only.
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.importAllowed ? 0 : 2;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Identity preflight failed');
    process.exitCode = 1;
  }
}
