import { Pool } from 'pg';

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

const ident = (value: string) => {
  if (!IDENTIFIER.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `"${value}"`;
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
    const column = ident(filter.column);
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

const unionColumns = (rows: Record<string, unknown>[]) => (
  [...new Set(rows.flatMap((row) => Object.keys(row)))].sort()
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

export class NeonPostgresClient {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: 'motor-originacao-backend',
    });
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

  async insert(table: string, inputRows: unknown[]) {
    const rows = inputRows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row)));
    if (!rows.length) return [];
    const columns = unionColumns(rows);
    if (!columns.length) return [];

    const values: unknown[] = [];
    const tuples = rows.map((row) => {
      const placeholders = columns.map((column) => {
        values.push(row[column] ?? null);
        return `$${values.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });

    const result = await this.pool.query(
      `insert into public.${ident(table)} (${columns.map(ident).join(', ')})
       values ${tuples.join(', ')}
       returning *`,
      values,
    );
    return result.rows;
  }

  async upsert(table: string, inputRows: unknown[], onConflict?: string) {
    const rows = inputRows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row)));
    if (!rows.length) return [];

    const conflictColumns = String(onConflict ?? '')
      .split(',')
      .map((column) => column.trim())
      .filter(Boolean);
    conflictColumns.forEach(ident);

    const deduped = dedupeByConflict(rows, conflictColumns);
    const columns = unionColumns(deduped);
    const values: unknown[] = [];
    const tuples = deduped.map((row) => {
      const placeholders = columns.map((column) => {
        values.push(row[column] ?? null);
        return `$${values.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });

    const updateColumns = columns.filter((column) => !conflictColumns.includes(column));
    const conflictSql = conflictColumns.length
      ? ` on conflict (${conflictColumns.map(ident).join(', ')}) ${updateColumns.length
          ? `do update set ${updateColumns.map((column) => `${ident(column)} = excluded.${ident(column)}`).join(', ')}`
          : 'do nothing'}`
      : '';

    const result = await this.pool.query(
      `insert into public.${ident(table)} (${columns.map(ident).join(', ')})
       values ${tuples.join(', ')}
       ${conflictSql}
       returning *`,
      values,
    );
    return result.rows;
  }

  async update(table: string, payload: Record<string, unknown>, filters: FilterDefinition[]) {
    const columns = Object.keys(payload).sort();
    if (!columns.length) return [];
    const values = columns.map((column) => payload[column]);
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

  async rpcAsUser<T = unknown>(
    fn: string,
    args: Record<string, unknown>,
    identity: { id: string; email?: string; role?: string },
  ) {
    const fnName = ident(fn);
    const entries = Object.entries(args);
    entries.forEach(([name]) => ident(name));
    const values = entries.map(([, value]) => value);
    const namedArgs = entries.map(([name], index) => `${ident(name)} => ${index + 1}`).join(', ');
    const client = await this.pool.connect();

    try {
      await client.query('begin');
      await client.query(
        `select
           set_config('request.jwt.claim.sub', $1, true),
           set_config('request.jwt.claim.role', $2, true),
           set_config('request.jwt.claims', $3, true)`,
        [
          identity.id,
          identity.role ?? 'authenticated',
          JSON.stringify({
            sub: identity.id,
            email: identity.email ?? null,
            role: identity.role ?? 'authenticated',
          }),
        ],
      );
      await client.query('set local role authenticated');
      const result = await client.query(
        `select * from public.${fnName}(${namedArgs})`,
        values,
      );
      await client.query('commit');

      if (result.fields.length === 1 && result.fields[0]?.name === fn) {
        if (result.rows.length === 1) return result.rows[0][fn] as T;
        return result.rows.map((row) => row[fn]) as T;
      }
      return result.rows as T;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async rpc<T = unknown>(fn: string, args: Record<string, unknown>) {
    const fnName = ident(fn);
    const entries = Object.entries(args);
    entries.forEach(([name]) => ident(name));
    const values = entries.map(([, value]) => value);
    const namedArgs = entries.map(([name], index) => `${ident(name)} => $${index + 1}`).join(', ');
    const result = await this.pool.query(
      `select * from public.${fnName}(${namedArgs})`,
      values,
    );

    if (result.fields.length === 1 && result.fields[0]?.name === fn) {
      if (result.rows.length === 1) return result.rows[0][fn] as T;
      return result.rows.map((row) => row[fn]) as T;
    }
    return result.rows as T;
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

export const __test = { ident, selectList, buildWhere, dedupeByConflict };
