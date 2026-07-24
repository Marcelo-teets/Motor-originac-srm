import assert from 'node:assert/strict';
import test from 'node:test';
import { dedupeUpsertRows } from './supabase.js';

test('dedupeUpsertRows keeps the last row for the same conflict identity', () => {
  const rows = dedupeUpsertRows([
    { dataset_code: 'cvm_offers', record_key: 'same', status: 'first' },
    { dataset_code: 'cvm_offers', record_key: 'other', status: 'only' },
    { dataset_code: 'cvm_offers', record_key: 'same', status: 'latest' },
  ], 'dataset_code,record_key') as Array<Record<string, unknown>>;

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.find((row) => row.record_key === 'same'), {
    dataset_code: 'cvm_offers',
    record_key: 'same',
    status: 'latest',
  });
});

test('dedupeUpsertRows does not collapse rows with null conflict values', () => {
  const rows = dedupeUpsertRows([
    { dataset_code: 'cvm_offers', record_key: null, status: 'first' },
    { dataset_code: 'cvm_offers', record_key: null, status: 'second' },
  ], 'dataset_code,record_key');

  assert.equal(rows.length, 2);
});

test('dedupeUpsertRows preserves payload when no conflict target is provided', () => {
  const input = [{ id: 1 }, { id: 1 }];
  assert.equal(dedupeUpsertRows(input), input);
});
