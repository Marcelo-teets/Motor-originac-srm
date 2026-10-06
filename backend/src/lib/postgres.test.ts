import assert from 'node:assert/strict';
import test from 'node:test';
import { __test } from './postgres.js';

test('postgres adapter rejects unsafe identifiers and projections', () => {
  assert.throws(() => __test.ident('companies;drop table companies'));
  assert.throws(() => __test.selectList('id, now()'));
  assert.equal(__test.selectList('id,legal_name'), '"id", "legal_name"');
});

test('postgres adapter builds parameterized equality and in filters', () => {
  const built = __test.buildWhere([
    { column: 'company_id', value: 'abc' },
    { column: 'status', operator: 'in', value: ['open', 'queued'] },
  ]);
  assert.equal(built.sql, ' where "company_id" = $1 and "status" in ($2, $3)');
  assert.deepEqual(built.values, ['abc', 'open', 'queued']);
});

test('postgres adapter refuses accidental empty-list in filters by using false', () => {
  const built = __test.buildWhere([{ column: 'id', operator: 'in', value: [] }]);
  assert.equal(built.sql, ' where false');
  assert.deepEqual(built.values, []);
});

test('postgres adapter deduplicates conflict keys with last row winning', () => {
  const rows = __test.dedupeByConflict([
    { id: '1', value: 'old' },
    { id: '1', value: 'new' },
  ], ['id']);
  assert.deepEqual(rows, [{ id: '1', value: 'new' }]);
});

test('postgres adapter binds RPC named arguments as positional placeholders', () => {
  const built = __test.functionCallSql('approve_review', { p_company_id: 'abc', p_notes: null });
  assert.equal(built.sql, 'select * from public."approve_review"("p_company_id" => $1, "p_notes" => $2)');
  assert.deepEqual(built.values, ['abc', null]);
  assert.throws(() => __test.functionCallSql('approve_review', { 'p_x); drop table x; --': 1 }));
});
