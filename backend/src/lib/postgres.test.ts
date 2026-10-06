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

type RecordedQuery = { sql: string; values: unknown[] };

const fakePool = (catalog: { jsonColumns?: string[]; jsonParams?: string[]; failCatalog?: boolean } = {}) => {
  const queries: RecordedQuery[] = [];
  const pool = {
    async query(sql: string, values: unknown[] = []) {
      queries.push({ sql, values });
      if (sql.includes('information_schema.columns')) {
        if (catalog.failCatalog) throw new Error('catalog unavailable');
        return { rows: (catalog.jsonColumns ?? []).map((column_name) => ({ column_name })), fields: [] };
      }
      if (sql.includes('information_schema.routines')) {
        return { rows: (catalog.jsonParams ?? []).map((parameter_name) => ({ parameter_name })), fields: [] };
      }
      return { rows: [], fields: [] };
    },
  };
  return { pool: pool as never, queries };
};

const statements = (queries: RecordedQuery[]) => queries.filter((query) => !query.sql.includes('information_schema') && !query.sql.includes('set_config('));

test('postgres adapter JSON-encodes values bound to json/jsonb columns only', async () => {
  const { pool, queries } = fakePool({ jsonColumns: ['evidence', 'filter_value', 'metadata'] });
  const { NeonPostgresClient } = await import('./postgres.js');
  const client = new NeonPostgresClient('postgres://unused', pool);

  await client.upsert('demo', [{
    id: 'a',
    evidence: ['x', 'y'],
    filter_value: 'FIDC',
    metadata: { nested: [1, 2] },
    tags: ['text', 'array'],
    note: undefined,
  }], 'id');

  const [insert] = statements(queries);
  // Columns are sorted; `note: undefined` is absent (JSON semantics), not NULL.
  assert.match(insert.sql, /\("evidence", "filter_value", "id", "metadata", "tags"\)/);
  assert.deepEqual(insert.values, ['["x","y"]', '"FIDC"', 'a', '{"nested":[1,2]}', ['text', 'array']]);
});

test('postgres adapter keeps empty arrays as JSON arrays instead of objects', async () => {
  const { pool, queries } = fakePool({ jsonColumns: ['evidence'] });
  const { NeonPostgresClient } = await import('./postgres.js');
  const client = new NeonPostgresClient('postgres://unused', pool);

  await client.insert('demo', [{ id: 'b', evidence: [] }]);
  await client.update('demo', { evidence: [] }, [{ column: 'id', value: 'b' }]);

  const [insert, update] = statements(queries);
  assert.deepEqual(insert.values, ['[]', 'b']);
  assert.deepEqual(update.values, ['[]', 'b']);
});

test('postgres adapter JSON-encodes jsonb RPC parameters and caches the catalog lookup', async () => {
  const { pool, queries } = fakePool({ jsonParams: ['p_records'] });
  const { NeonPostgresClient } = await import('./postgres.js');
  const client = new NeonPostgresClient('postgres://unused', pool);

  await client.rpc('persist_batch', { p_records: [{ id: 1 }], p_dataset_code: 'cvm' });
  await client.rpc('persist_batch', { p_records: [], p_dataset_code: 'cvm' });

  const catalogLookups = queries.filter((query) => query.sql.includes('information_schema.routines'));
  assert.equal(catalogLookups.length, 1);
  const [first, second] = statements(queries);
  assert.match(first.sql, /public\."persist_batch"\("p_records" => \$1, "p_dataset_code" => \$2\)/);
  assert.deepEqual(first.values, ['[{"id":1}]', 'cvm']);
  assert.deepEqual(second.values, ['[]', 'cvm']);
});

test('postgres adapter binds RPC arguments as placeholders and sets request claims', async () => {
  const { pool, queries } = fakePool();
  const { NeonPostgresClient } = await import('./postgres.js');
  const client = new NeonPostgresClient('postgres://unused', pool);

  await client.rpcAsUser('save_review', { p_company_id: 'c1', p_notes: 'x' }, { id: 'u1', email: 'a@b.c' });
  const claims = queries.find((query) => query.sql.includes('set_config('));
  assert.deepEqual(claims?.values.slice(0, 2), ['u1', 'authenticated']);
  assert.deepEqual(JSON.parse(String(claims?.values[2])), { sub: 'u1', email: 'a@b.c', role: 'authenticated' });
  const [call] = statements(queries);
  // Regression: arguments were rendered as literal integers (`=> 1`), so every
  // RPC with arguments failed with "function … does not exist".
  assert.match(call.sql, /"p_company_id" => \$1, "p_notes" => \$2/);
  assert.deepEqual(call.values, ['c1', 'x']);
});

test('postgres adapter falls back to native encoding when the catalog lookup fails', async () => {
  const { pool, queries } = fakePool({ failCatalog: true });
  const { NeonPostgresClient } = await import('./postgres.js');
  const client = new NeonPostgresClient('postgres://unused', pool);

  await client.insert('demo', [{ id: 'c', tags: ['a'] }]);
  await client.insert('demo', [{ id: 'd', tags: ['b'] }]);

  // A failed lookup is retried on the next call rather than cached.
  assert.equal(queries.filter((query) => query.sql.includes('information_schema.columns')).length, 2);
  assert.deepEqual(statements(queries)[0].values, ['c', ['a']]);
});

test('postgres adapter writes rows with different shapes atomically without forcing NULLs', async () => {
  const { pool, queries } = fakePool();
  const transactional = Object.assign(pool as object, {
    async connect() {
      return { query: (pool as any).query, release() { queries.push({ sql: 'release', values: [] }); } };
    },
  });
  const { NeonPostgresClient } = await import('./postgres.js');
  const client = new NeonPostgresClient('postgres://unused', transactional as never);

  await client.upsert('demo', [
    { id: '1', name: 'a', metadata: undefined },
    { id: '2', name: 'b', metadata: { x: 1 } },
    { id: '3', name: 'c' },
  ], 'id');

  const sql = statements(queries).map((query) => query.sql.replace(/\s+/g, ' ').trim());
  assert.equal(sql[0], 'begin');
  assert.match(sql[1], /^insert into public\."demo" \("id", "name"\) values \(\$1, \$2\), \(\$3, \$4\) on conflict \("id"\) do update set "name" = excluded\."name"/);
  assert.match(sql[2], /^insert into public\."demo" \("id", "metadata", "name"\) values \(\$1, \$2, \$3\)/);
  assert.equal(sql[3], 'commit');
  assert.equal(sql[4], 'release');
});

test('postgres adapter update skips undefined keys but keeps explicit nulls', async () => {
  const { pool, queries } = fakePool();
  const { NeonPostgresClient } = await import('./postgres.js');
  const client = new NeonPostgresClient('postgres://unused', pool);

  await client.update('tasks', { title: undefined, description: null, status: 'done' }, [{ column: 'id', value: 't1' }]);
  const [update] = statements(queries);
  assert.match(update.sql, /set "description" = \$1, "status" = \$2 where "id" = \$3/);
  assert.deepEqual(update.values, [null, 'done', 't1']);
});
