import test from 'node:test';
import assert from 'node:assert/strict';
import { DEPENDENCIES, evaluateLineageCoverage } from './lineage-readiness-preflight.mjs';

const references = () => Object.fromEntries(
  Object.entries(DEPENDENCIES).map(([table, columns]) =>
    [table, Object.fromEntries(columns.map(column => [column, []]))]));

test('two historical rows sharing source code cannot be treated as one source', () => {
  const items = references();
  items.monitoring_outputs.source_id = [
    { id: 'historical-one', rows: 3 }, { id: 'historical-two', rows: 5 },
  ];
  const result = evaluateLineageCoverage({
    companies: [], sources: [
      { id: 'historical-one', code: 'source_example' },
      { id: 'historical-two', code: 'SOURCE_EXAMPLE' },
    ], references: items,
  }, {
    companies: [], sources: [{ id: 'active-source', code: 'source_example' }],
  });
  const report = result.comparisons.find(row =>
    row.table === 'monitoring_outputs' && row.reference === 'source_id');
  assert.equal(report.mappableByUniqueNaturalKey, 0);
  assert.equal(report.ambiguousSourceKey, 8);
  assert.equal(result.unmappedSourceRows, 8);
  assert.equal(result.importAllowed, false);
  assert.doesNotMatch(JSON.stringify(result), /historical-one|source_example/);
});

test('unique historical source keys remain eligible only for diagnostic mapping', () => {
  const items = references();
  items.monitoring_outputs.source_id = [{ id: 'legacy-a', rows: 2 }];
  const result = evaluateLineageCoverage({
    companies: [], sources: [{ id: 'legacy-a', code: 'catalog_one' }], references: items,
  }, {
    companies: [], sources: [{ id: 'now-b', code: 'CATALOG_ONE' }],
  });
  const report = result.comparisons.find(row =>
    row.table === 'monitoring_outputs' && row.reference === 'source_id');
  assert.equal(report.mappableByUniqueNaturalKey, 2);
  assert.equal(report.ambiguousSourceKey, 0);
  assert.equal(result.cutoverApproved, false);
});
