import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEPENDENCIES, evaluateLineageCoverage } from './lineage-readiness-preflight.mjs';

const refs = () => Object.fromEntries(Object.entries(DEPENDENCIES).map(
  ([table, columns]) => [table, Object.fromEntries(columns.map(column => [column, []]))],
));

test('tracks weighted evidence that source codes map while UUIDs differ', () => {
  const references = refs();
  references.monitoring_outputs.company_id = [{ id: 'co-old', rows: 100 }];
  references.monitoring_outputs.source_id = [
    { id: 'src-old-1', rows: 70 }, { id: 'src-old-2', rows: 30 },
  ];
  references.company_signals.source_id = [{ id: 'src-old-1', rows: 3 }];
  const result = evaluateLineageCoverage({
    companies: [{ id: 'co-old', cnpj: '11.444.777/0001-61' }],
    sources: [{ id: 'src-old-1', code: 'CVM_FIDC' }, { id: 'src-old-2', code: 'LEGACY_MISSING' }],
    references,
  }, {
    companies: [{ id: 'co-new', cnpj: '11.444.777/0001-61' }],
    sources: [{ id: 'src-new-1', code: ' cvm_fidc ' }],
  });
  const get = (table, reference) => result.comparisons.find(r => r.table === table && r.reference === reference);
  assert.equal(get('monitoring_outputs', 'company_id').mappableByUniqueNaturalKey, 100);
  assert.equal(get('monitoring_outputs', 'source_id').mappableByUniqueNaturalKey, 70);
  assert.equal(get('monitoring_outputs', 'source_id').unmatchedTargetKey, 30);
  assert.equal(get('company_signals', 'source_id').mappableByUniqueNaturalKey, 3);
  assert.equal(result.unmappedSourceRows, 30);
  assert.equal(result.importAllowed, false);
  assert.equal(result.cutoverApproved, false);
  assert.doesNotMatch(JSON.stringify(result), /CVM_FIDC|11\.444\.777|src-old/);
});

test('detects ambiguous destination natural keys and missing source parents', () => {
  const references = refs();
  references.source_connector_runs.source_id = [
    { id: 'src', rows: 8 }, { id: 'orphan', rows: 2 }, { id: 'blank', rows: 1 },
  ];
  const result = evaluateLineageCoverage({
    companies: [], sources: [{ id: 'src', code: 'identical' }, { id: 'blank', code: '' }], references,
  }, {
    companies: [],
    sources: [{ id: 'target-1', code: 'identical' }, { id: 'target-2', code: 'identical' }],
  });
  const report = result.comparisons.find(item => item.table === 'source_connector_runs' && item.reference === 'source_id');
  assert.equal(report.ambiguousTargetKey, 8);
  assert.equal(report.missingSourceParent, 2);
  assert.equal(report.missingParentNaturalKey, 1);
  assert.equal(report.complete, false);
  assert.equal(result.unmappedSourceRows, 11);
});

test('all matched parent keys still require branch, FK, rollback and human signoff', () => {
  const references = refs();
  references.pipeline.company_id = [{ id: 'old', rows: 15 }];
  const result = evaluateLineageCoverage({
    companies: [{ id: 'old', cnpj: '11444777000161' }], sources: [], references,
  }, {
    companies: [{ id: 'new', cnpj: '11444777000161' }], sources: [],
  });
  assert.equal(result.allKnownParentReferencesMappable, true);
  assert.equal(result.cutoverApproved, false);
  assert.equal(result.importAllowed, false);
  assert.ok(result.excludedRelationsRequiringSeparateMapping.some(s => s.includes('run_id')));
});

test('fails closed on incomplete input and non-finite grouped counters', () => {
  assert.throws(() => evaluateLineageCoverage({}, {}), /Missing company parents/);
  const references = refs();
  references.pipeline.company_id = [{ id: 'old', rows: 'broken' }];
  const result = evaluateLineageCoverage({
    companies: [{ id: 'old', cnpj: '11444777000161' }],
    sources: [], references,
  }, {
    companies: [{ id: 'new', cnpj: '11444777000161' }], sources: [],
  });
  assert.equal(result.importAllowed, false);
  const entry = result.comparisons.find(r => r.table === 'pipeline' && r.reference === 'company_id');
  assert.equal(entry.invalidCountRows, 1);
  assert.equal(entry.complete, false);
});

test('actual database audit reads only aggregates and FK parent IDs, and never emits raw identifiers', () => {
  const src = readFileSync(new URL('./lineage-readiness-preflight.mjs', import.meta.url), 'utf8');
  assert.match(src, /BEGIN TRANSACTION READ ONLY/);
  assert.match(src, /assertAuditConnections\(supabaseUrl, neonUrl\)/);
  assert.match(src, /count\(\*\)::integer rows/);
  assert.match(src, /process\.exitCode = 2/);
  assert.doesNotMatch(src, /\bINSERT INTO\b|\bDELETE FROM\b|\bUPDATE public\b|\bCREATE TABLE\b/i);
  assert.doesNotMatch(src, /console\.log\(.*(?:sources|companies|cnpj)\)/i);
});

test('alphanumeric companies with verified checksum are matchable only in theory', () => {
  const references = refs();
  references.pipeline.company_id = [{ id: 'legacy-alphanum', rows: 4 }];
  const report = evaluateLineageCoverage({
    companies: [{ id:'legacy-alphanum',cnpj:'00.000.000/E08G-12' }],
    sources: [], references,
  }, {
    companies: [{ id:'active-alphanum',cnpj:'00000000e08g12' }],
    sources: [],
  });
  const entry = report.comparisons.find(x => x.table === 'pipeline' && x.reference === 'company_id');
  assert.equal(entry.mappableByUniqueNaturalKey, 4);
  assert.equal(report.importAllowed, false);
  assert.doesNotMatch(JSON.stringify(report),/00000000E08G12/);
});
