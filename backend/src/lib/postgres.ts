import { Pool, type QueryResult } from 'pg';

export type QueryOptions = {
  select?: string;
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
  filters?: FilterDefinition[];
};

export type FilterDefinition = {
  column: string;
  operator?: 'eq' | 'in' | 'is' | 'lt' | 'lte' | 'gt' | 'gte';
  value: string | number | boolean | null | Array<string | number>;
};

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;
const SELECT_LIST = /^(\*|[a-z_][a-z0-9_]*(\s*,\s*[a-z_][a-z0-9_]*)*)$/i;

const normalizeNeonConnectionString = (connectionString: string) => {
  try {
    const parsed = new URL(connectionString);
    if (!parsed.hostname.endsWith('.neon.tech')) return connectionString;
    const mode = parsed.searchParams.get('sslmode');
    if (!mode || mode === 'require' || mode === 'prefer') {
      parsed.searchParams.set('sslmode', 'verify-full');
    }
    return parsed.toString();
  } catch {
    return connectionString;
  }
};

const ident = (value: string) => {
  if (!IDENTIFIER.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `"${value}"`;
};

// Filters may target one level of JSON text extraction: `raw_payload->>transportSourceRef`.
// Both the column and the key must be plain identifiers; the key is emitted as a
// quoted literal, so nothing user-controlled reaches the SQL text.
const JSON_TEXT_PATH = /^([a-z_][a-z0-9_]*)->>([a-z_][a-z0-9_]*)$/i;

const filterColumn = (value: string) => {
  const jsonPath = JSON_TEXT_PATH.exec(value);
  if (jsonPath) return `${ident(jsonPath[1])}->>'${jsonPath[2]}'`;
  return ident(value);
};

const selectList = (value = '*') => {
  if (!SELECT_LIST.test(value.trim())) throw new Error(`Unsupported select list: ${value}`);
  if (value.trim() === '*') return '*';
  return value.split(',').map((part) => ident(part.trim())).join(', ');
};

const operatorSql = (operator: FilterDefinition['operator'] = 'eq') => ({
  eq: '=',
  lt: '<',
  lte: '<=',
  gt: '>',
  gte: '>=',
}[operator] ?? '=');

const buildWhere = (filters: FilterDefinition[] = [], startAt = 1) => {
  const values: unknown[] = [];
  const clauses: string[] = [];

  for (const filter of filters) {
    const column = filterColumn(filter.column);
    const op = filter.operator ?? 'eq';

    if (op === 'is') {
      if (filter.value === null) clauses.push(`${column} is null`);
      else clauses.push(`${column} is not distinct from $${startAt + values.length}`);
      if (filter.value !== null) values.push(filter.value);
      continue;
    }

    if (op === 'in') {
      const list = Array.isArray(filter.value) ? filter.value : [filter.value as string | number];
      if (!list.length) {
        clauses.push('false');
        continue;
      }
      const placeholders = list.map((value) => {
        values.push(value);
        return `$${startAt + values.length - 1}`;
      });
      clauses.push(`${column} in (${placeholders.join(', ')})`);
      continue;
    }

    values.push(filter.value);
    clauses.push(`${column} ${operatorSql(op)} $${startAt + values.length - 1}`);
  }

  return {
    sql: clauses.length ? ` where ${clauses.join(' and ')}` : '',
    values,
  };
};

// JSON semantics (what PostgREST received): a key whose value is `undefined` is
// absent, so the column keeps its database default on insert and is left
// untouched on update/upsert instead of being forced to NULL.
const withoutUndefined = (row: Record<string, unknown>) => Object.fromEntries(
  Object.entries(row).filter(([, value]) => value !== undefined),
);

const shapeKey = (row: Record<string, unknown>) => Object.keys(row).sort().join(',');

// Rows with different key sets are written in separate statements so a column
// missing from one row never becomes an explicit NULL (which breaks NOT NULL
// DEFAULT columns and, on upsert, would wipe the stored value).
const groupByShape = (rows: Record<string, unknown>[]) => {
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const key = shapeKey(row);
    if (!key) continue;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.values()];
};

// Postgres accepts at most 65535 bind parameters per statement; stay well below
// so large batches are written as several statements (still in one
// transaction, see writeRows) instead of failing.
const MAX_BIND_PARAMETERS = 30_000;

const chunkForParameters = <T>(rows: T[], columnCount: number) => {
  const size = Math.max(1, Math.floor(MAX_BIND_PARAMETERS / Math.max(1, columnCount)));
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) chunks.push(rows.slice(index, index + size));
  return chunks;
};

const isPlainRow = (row: unknown): row is Record<string, unknown> => (
  Boolean(row && typeof row === 'object' && !Array.isArray(row))
);

const dedupeByConflict = (rows: Record<string, unknown>[], conflictColumns: string[]) => {
  if (!conflictColumns.length || rows.length < 2) return rows;
  const map = new Map<string, Record<string, unknown>>();
  rows.forEach((row, index) => {
    const values = conflictColumns.map((column) => row[column]);
    if (values.some((value) => value === null || value === undefined)) {
      map.set(`row:${index}`, row);
      return;
    }
    map.set(JSON.stringify(values), row);
  });
  return [...map.values()];
};

type QueryClient = Pick<Pool, 'query'>;
type Queryable = QueryClient & {
  connect?: () => Promise<QueryClient & { release: (error?: Error | boolean) => void }>;
  end?: () => Promise<void>;
};

/**
 * node-postgres serializes JS arrays as Postgres array literals (`{a,b}`) and
 * passes strings through untouched. Both are wrong for json/jsonb targets:
 * `['a']` becomes the invalid JSON `{"a"}`, `[]` silently becomes the object
 * `{}` and a plain string such as `FIDC` is rejected as invalid JSON. PostgREST
 * (the legacy PostgREST data plane) always sent JSON, so callers rely on JSON
 * semantics. Values bound to json/jsonb columns or RPC parameters are therefore
 * JSON-encoded explicitly; everything else (text[], uuid[], scalars) keeps the
 * native node-postgres encoding.
 */
const toParam = (value: unknown, json: boolean) => {
  if (value === undefined || value === null) return null;
  return json ? JSON.stringify(value) : value;
};

const JSON_COLUMNS_SQL = `
  select column_name
  from information_schema.columns
  where table_schema = 'public'
    and table_name = $1
    and data_type in ('json', 'jsonb')`;

const JSON_PARAMS_SQL = `
  select distinct p.parameter_name
  from information_schema.routines r
  join information_schema.parameters p
    on p.specific_schema = r.specific_schema
   and p.specific_name = r.specific_name
  where r.routine_schema = 'public'
    and r.routine_name = $1
    and p.parameter_mode in ('IN', 'INOUT')
    and p.parameter_name is not null
    and p.data_type in ('json', 'jsonb')`;

export class NeonPostgresClient {
  private readonly pool: Queryable;
  private readonly jsonColumnCache = new Map<string, Promise<Set<string>>>();
  private readonly jsonParamCache = new Map<string, Promise<Set<string>>>();

  constructor(connectionString: string, pool?: Queryable) {
    this.pool = pool ?? new Pool({
      connectionString: normalizeNeonConnectionString(connectionString),
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: 'motor-originacao-backend',
    });
  }

  private cachedNameSet(cache: Map<string, Promise<Set<string>>>, key: string, sql: string, column: string) {
    const cached = cache.get(key);
    if (cached) return cached;
    const loading = this.pool.query(sql, [key])
      .then((result) => new Set(result.rows.map((row) => String(row[column]))))
      .catch((error: unknown) => {
        // Never cache a failed catalog lookup; the next call retries it.
        cache.delete(key);
        throw error;
      });
    cache.set(key, loading);
    return loading;
  }

  // A failed catalog lookup degrades to the native encoding (the pre-existing
  // behaviour) instead of failing the write itself; the real statement still
  // surfaces any connectivity error.
  /** json/jsonb column names of `public.<table>` (cached per table for the pool lifetime). */
  private jsonColumns(table: string) {
    return this.cachedNameSet(this.jsonColumnCache, table, JSON_COLUMNS_SQL, 'column_name')
      .catch(() => new Set<string>());
  }

  /** json/jsonb IN parameter names of `public.<fn>` across all overloads. */
  private jsonParams(fn: string) {
    return this.cachedNameSet(this.jsonParamCache, fn, JSON_PARAMS_SQL, 'parameter_name')
      .catch(() => new Set<string>());
  }

  async close() {
    await this.pool.end?.();
  }

  async select(table: string, options: QueryOptions = {}) {
    const selected = selectList(options.select);
    const where = buildWhere(options.filters);
    const order = options.orderBy
      ? ` order by ${ident(options.orderBy.column)} ${options.orderBy.ascending === false ? 'desc' : 'asc'}`
      : '';
    const limit = options.limit ? ` limit ${Math.max(1, Math.trunc(options.limit))}` : '';
    const result = await this.pool.query(
      `select ${selected} from public.${ident(table)}${where.sql}${order}${limit}`,
      where.values,
    );
    return result.rows;
  }

  private async writeRows(table: string, rows: Record<string, unknown>[], conflictColumns: string[] | null) {
    const groups = groupByShape(rows);
    if (!groups.length) return [];
    const jsonColumns = await this.jsonColumns(table);

    const batches = groups.flatMap((group) => chunkForParameters(group, Object.keys(group[0]).length));
    const statements = batches.map((group) => {
      const columns = Object.keys(group[0]).sort();
      const values: unknown[] = [];
      const tuples = group.map((row) => {
        const placeholders = columns.map((column) => {
          values.push(toParam(row[column], jsonColumns.has(column)));
          return `$${values.length}`;
        });
        return `(${placeholders.join(', ')})`;
      });

      let conflictSql = '';
      if (conflictColumns?.length) {
        const updateColumns = columns.filter((column) => !conflictColumns.includes(column));
        conflictSql = ` on conflict (${conflictColumns.map(ident).join(', ')}) ${updateColumns.length
          ? `do update set ${updateColumns.map((column) => `${ident(column)} = excluded.${ident(column)}`).join(', ')}`
          : 'do nothing'}`;
      }

      return {
        sql: `insert into public.${ident(table)} (${columns.map(ident).join(', ')})
       values ${tuples.join(', ')}${conflictSql}
       returning *`,
        values,
      };
    });

    if (statements.length === 1 || !this.pool.connect) {
      const output: Record<string, unknown>[] = [];
      for (const statement of statements) {
        output.push(...(await this.pool.query(statement.sql, statement.values)).rows);
      }
      return output;
    }

    // Several shapes or chunks: keep the call atomic, as a single multi-row INSERT was.
    const connection = await this.pool.connect();
    try {
      await connection.query('begin');
      const output: Record<string, unknown>[] = [];
      for (const statement of statements) {
        output.push(...(await connection.query(statement.sql, statement.values)).rows);
      }
      await connection.query('commit');
      return output;
    } catch (error) {
      await connection.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }

  async insert(table: string, inputRows: unknown[]) {
    const rows = inputRows.filter(isPlainRow).map(withoutUndefined);
    return this.writeRows(table, rows, null);
  }

  async upsert(table: string, inputRows: unknown[], onConflict?: string) {
    const rows = inputRows.filter(isPlainRow).map(withoutUndefined);
    if (!rows.length) return [];

    const conflictColumns = String(onConflict ?? '')
      .split(',')
      .map((column) => column.trim())
      .filter(Boolean);
    conflictColumns.forEach(ident);

    return this.writeRows(table, dedupeByConflict(rows, conflictColumns), conflictColumns);
  }

  async update(table: string, payload: Record<string, unknown>, filters: FilterDefinition[]) {
    const defined = withoutUndefined(payload);
    const columns = Object.keys(defined).sort();
    if (!columns.length) return [];
    const jsonColumns = await this.jsonColumns(table);
    const values = columns.map((column) => toParam(defined[column], jsonColumns.has(column)));
    const setSql = columns.map((column, index) => `${ident(column)} = $${index + 1}`).join(', ');
    const where = buildWhere(filters, values.length + 1);
    const result = await this.pool.query(
      `update public.${ident(table)} set ${setSql}${where.sql} returning *`,
      [...values, ...where.values],
    );
    return result.rows;
  }

  async delete(table: string, filters: FilterDefinition[]) {
    const where = buildWhere(filters);
    if (!where.sql) throw new Error('Refusing unfiltered delete through NeonPostgresClient.');
    const result = await this.pool.query(
      `delete from public.${ident(table)}${where.sql} returning *`,
      where.values,
    );
    return result.rows;
  }

  async query<T extends Record<string, unknown> = Record<string, unknown>>(text: string, values: unknown[] = []) {
    const result = await this.pool.query(text, values);
    return result.rows as T[];
  }

  /**
   * Calls `public.<fn>` inside a transaction with request.jwt.* claims set, so
   * functions ported from the legacy provider that read `auth.uid()`/role claims keep
   * working. Arguments are bound as `$n` placeholders (never interpolated) and
   * json/jsonb parameters are JSON-encoded.
   */
  private async callFunction<T>(fn: string, args: Record<string, unknown>, claims: Record<string, string | null>) {
    const fnName = ident(fn);
    const entries = Object.entries(args);
    entries.forEach(([name]) => ident(name));
    const jsonParams = entries.length ? await this.jsonParams(fn) : new Set<string>();
    const values = entries.map(([name, value]) => toParam(value, jsonParams.has(name)));
    const namedArgs = entries.map(([name], index) => `${ident(name)} => $${index + 1}`).join(', ');

    const runInTransaction = async (connection: QueryClient): Promise<QueryResult> => {
      await connection.query(
        `select
           set_config('request.jwt.claim.sub', $1, true),
           set_config('request.jwt.claim.role', $2, true),
           set_config('request.jwt.claims', $3, true)`,
        [claims.sub ?? '', claims.role ?? '', JSON.stringify(claims)],
      );
      return connection.query(`select * from public.${fnName}(${namedArgs})`, values);
    };

    let result: QueryResult;
    if (!this.pool.connect) {
      result = await runInTransaction(this.pool);
    } else {
      const connection = await this.pool.connect();
      try {
        await connection.query('begin');
        result = await runInTransaction(connection);
        await connection.query('commit');
      } catch (error) {
        await connection.query('rollback').catch(() => undefined);
        throw error;
      } finally {
        connection.release();
      }
    }

    if (result.fields.length === 1 && result.fields[0]?.name === fn) {
      if (result.rows.length === 1) return result.rows[0][fn] as T;
      return result.rows.map((row) => row[fn]) as T;
    }
    return result.rows as T;
  }

  async rpcAsUser<T = unknown>(
    fn: string,
    args: Record<string, unknown>,
    identity: { id: string; email?: string; role?: string },
  ) {
    const role = identity.role ?? 'authenticated';
    return this.callFunction<T>(fn, args, { sub: identity.id, email: identity.email ?? null, role });
  }

  async rpc<T = unknown>(fn: string, args: Record<string, unknown>) {
    return this.callFunction<T>(fn, args, { sub: null, role: 'service_role' });
  }

  async health() {
    const result = await this.pool.query('select current_database() as database, now() as checked_at');
    return result.rows[0];
  }
}

let singleton: NeonPostgresClient | null = null;
let singletonUrl = '';

export const getNeonPostgresClient = (connectionString: string) => {
  if (!connectionString) return null;
  if (!singleton || singletonUrl !== connectionString) {
    singleton = new NeonPostgresClient(connectionString);
    singletonUrl = connectionString;
  }
  return singleton;
};

export const __test = { ident, filterColumn, selectList, buildWhere, dedupeByConflict, toParam, groupByShape, withoutUndefined, chunkForParameters, normalizeNeonConnectionString };
