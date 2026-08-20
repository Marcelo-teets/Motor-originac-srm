import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSummaryFromDisplayedRows, normalizeRowsForComparison } from './source-control-sheet-summary-repair.mjs';

test('counts localized status and health labels from displayed Sheet rows', () => {
  const summary = buildSummaryFromDisplayedRows([
    ['1', 'Fonte A', 'Real', 'Saudável'],
    ['2', 'Fonte B', 'Ativa', 'Saudável'],
    ['3', 'Fonte C', 'Parcial', 'Degradada'],
    ['4', 'Fonte D', 'Planejada', 'Degradada'],
    ['', '', '', ''],
  ]);
  assert.deepEqual(summary, [
    ['Total', 4, 'Real', 1, 'Ativa', 1, 'Parcial', 1],
    ['Planejada', 1, 'Saudável', 2, 'Degradada', 2, 'Controle', 'Supabase → Sheets'],
  ]);
});

test('treats numeric values read back from Sheets as equivalent strings', () => {
  const actual = [['Total', '4', 'Real', '1']];
  const expected = [['Total', 4, 'Real', 1]];
  assert.equal(
    JSON.stringify(normalizeRowsForComparison(actual)),
    JSON.stringify(normalizeRowsForComparison(expected)),
  );
});
