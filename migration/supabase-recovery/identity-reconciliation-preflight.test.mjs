import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateIdentityReconciliation } from './identity-reconciliation-preflight.mjs';

const company = (id, cnpj) => ({ id, cnpj });
const source = (id, code) => ({ id, code });

test('matching source codes never imply UUID compatibility or permission to merge', () => {
  const report = evaluateIdentityReconciliation(
    { companies: [company('c1','12.345.678/0001-90'),company('c2','01.234.567/0001-89')],
      sources: [source('source-legacy','cvm_fidc'),source('source-only','rss_new')] },
    { companies: [company('c3','12.345.678/0001-90'),company('c4','22.222.222/0001-22')],
      sources: [source('source-new','CVM_FIDC'),source('source-unique','other')] },
  );
  assert.equal(report.cutoverApproved, false);
  assert.equal(report.importAllowed, false);
  assert.equal(report.companies.matchedCnpj, 1);
  assert.equal(report.companies.matchedUuid, 0);
  assert.equal(report.companies.matchedCnpjDifferentUuid, 1);
  assert.equal(report.sources.matchedCode, 1);
  assert.equal(report.sources.matchedUuid, 0);
  assert.equal(report.sources.matchedCodeDifferentUuid, 1);
  assert.equal(report.sources.supabase, 2);
  assert.equal(report.sources.neon, 2);
  assert.doesNotMatch(JSON.stringify(report), /12\.345\.678|cvm_fidc|source-legacy/);
});

test('duplicate and invalid company identity cannot be silently promoted', () => {
  const report = evaluateIdentityReconciliation(
    { companies: [company('1','12345678000190'),company('2','12345678000190'),company('3','')],
      sources: [source('4','CVM'),source('5',' cvm '),source('6',null)] },
    { companies: [company('1','98765432000178')],sources: [source('7','CVM')] },
  );
  assert.equal(report.companies.duplicateCnpjGroups.supabase, 1);
  assert.equal(report.companies.matchedUuidDifferentCnpj, 1);
  assert.equal(report.companies.missingOrInvalidCnpj.supabase, 1);
  assert.equal(report.sources.duplicateCodeGroups.supabase, 1);
  assert.equal(report.sources.missingCode.supabase, 1);
  assert.equal(report.importAllowed, false);
});

test('empty matching inputs cannot authorize an import', () => {
  const report = evaluateIdentityReconciliation(
    { companies: [], sources: [] }, { companies: [], sources: [] });
  assert.equal(report.companies.matchedCnpj, 0);
  assert.equal(report.sources.matchedCode, 0);
  assert.equal(report.importAllowed, false);
  assert.match(report.status, /blocked/);
});

test('refuses malformed inputs and never emits business identifiers', () => {
  assert.throws(() => evaluateIdentityReconciliation({}, {}), /Expected company identity rows/);
  const code = readFileSync(new URL('./identity-reconciliation-preflight.mjs',import.meta.url),'utf8');
  assert.match(code,/BEGIN TRANSACTION READ ONLY/);
  assert.match(code,/select id::text as id, cnpj from public\.companies/);
  assert.match(code,/metadata->>'code'/);
  assert.match(code,/assertAuditConnections\(supabaseUrl, neonUrl\)/);
  assert.doesNotMatch(code, /\bINSERT INTO\b|\bDELETE FROM\b|\bUPDATE public\b|\bCREATE TABLE\b/);
  assert.doesNotMatch(code, /console\.log\(.*(?:company|source|cnpj|rows)\)/i);
});
