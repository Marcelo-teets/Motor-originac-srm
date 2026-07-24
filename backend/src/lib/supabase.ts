import { env } from './env.js';

type QueryOptions = {
  select?: string;
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
  filters?: FilterDefinition[];
};

type FilterDefinition = {
  column: string;
  operator?: 'eq' | 'in' | 'is' | 'lt' | 'lte' | 'gt' | 'gte';
  value: string | number | boolean | null | Array<string | number>;
};

type SupabaseFetchRetryOptions = {
  attempts?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
  fetchImpl?: typeof fetch;
  sleepImpl?: (milliseconds: number) => Promise<void>;
  label?: string;
};

const RETRYABLE_SUPABASE_STATUS = new Set([408, 425, 429, 502, 503, 504]);
const DEFAULT_SUPABASE_ATTEMPTS = 5;
const DEFAULT_SUPABASE_TIMEOUT_MS = 60_000;
const DEFAULT_SUPABASE_BASE_DELAY_MS = 500;

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const encodeFilterValue = (value: FilterDefinition['value']) => {
  if (Array.isArray(value)) return `(${value.map((item) => `"${String(item).replaceAll('"', '\\"')}"`).join(',')})`;
  if (value === null) return 'null';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  return String(value);
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const describeFetchError = (error: unknown) => {
  if (!(error instanceof Error)) return String(error);
  const messages = [error.message];
  let cause = error.cause;
  const seen = new Set<unknown>();

  while (cause && !seen.has(cause)) {
    seen.add(cause);
    if (cause instanceof Error) {
      const code = 'code' in cause && typeof cause.code === 'string' ? ` [${cause.code}]` : '';
      messages.push(`${cause.message}${code}`);
      cause = cause.cause;
    } else if (typeof cause === 'object' && cause !== null) {
      const record = cause as Record<string, unknown>;
      const message = typeof record.message === 'string' ? record.message : JSON.stringify(record);
      const code = typeof record.code === 'string' ? ` [${record.code}]` : '';
      messages.push(`${message}${code}`);
      cause = record.cause;
    } else {
      messages.push(String(cause));
      break;
    }
  }

  return [...new Set(messages.filter(Boolean))].join(' <- ');
};

const responseExcerpt = async (response: Response) => {
  try {
    return (await response.clone().text()).replace(/\s+/g, ' ').trim().slice(0, 800);
  } catch {
    return '';
  }
};

const isRetryableSupabaseResponse = async (response: Response) => {
  if (RETRYABLE_SUPABASE_STATUS.has(response.status)) return true;
  if (response.status !== 500) return false;

  const body = await responseExcerpt(response);
  // PostgREST returns structured deterministic database errors as HTTP 500.
  // Retrying those would only add latency and can hide the real constraint issue.
  return !/"code"\s*:\s*"[A-Z0-9]+"/i.test(body);
};

export const fetchSupabaseWithRetry = async (
  input: string | URL,
  init: RequestInit,
  options: SupabaseFetchRetryOptions = {},
) => {
  const attempts = Math.max(1, options.attempts ?? DEFAULT_SUPABASE_ATTEMPTS);
  const timeoutMs = Math.max(1_000, options.timeoutMs ?? DEFAULT_SUPABASE_TIMEOUT_MS);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? DEFAULT_SUPABASE_BASE_DELAY_MS);
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? sleep;
  const label = options.label ?? String(input);
  let lastError: unknown;
  let lastResponse: Response | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(input, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(timeoutMs),
      });
      lastResponse = response;

      if (response.ok || !(await isRetryableSupabaseResponse(response))) return response;
      lastError = new Error(`HTTP ${response.status}${(await responseExcerpt(response)) ? `: ${await responseExcerpt(response)}` : ''}`);
    } catch (error) {
      lastError = error;
      lastResponse = null;
    }

    if (attempt < attempts) {
      await sleepImpl(Math.min(baseDelayMs * (2 ** (attempt - 1)), 8_000));
    }
  }

  if (lastResponse) return lastResponse;
  throw new Error(
    `Supabase request ${label} failed after ${attempts} attempts: ${describeFetchError(lastError)}`,
  );
};

export const dedupeUpsertRows = (rows: unknown[], onConflict?: string) => {
  const conflictColumns = String(onConflict ?? '')
    .split(',')
    .map((column) => column.trim())
    .filter(Boolean);
  if (!conflictColumns.length || rows.length < 2) return rows;

  const deduped = new Map<string, unknown>();
  rows.forEach((row, index) => {
    if (!isRecord(row)) {
      deduped.set(`row:${index}`, row);
      return;
    }

    const values = conflictColumns.map((column) => row[column]);
    if (values.some((value) => value === null || value === undefined)) {
      // PostgreSQL unique constraints normally treat NULL values as distinct.
      deduped.set(`row:${index}`, row);
      return;
    }

    const key = JSON.stringify(values);
    // Last occurrence wins. CVM files can repeat an identity with a later state
    // in the same resource, and Postgres cannot update the same conflict key
    // twice inside one INSERT statement.
    deduped.set(key, row);
  });

  return [...deduped.values()];
};

class SupabaseRestClient {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceKey: string,
    private readonly anonKey: string,
  ) {}

  private buildUrl(table: string, options?: QueryOptions) {
    const url = new URL(`${this.baseUrl}/rest/v1/${table}`);
    if (options?.select) url.searchParams.set('select', options.select);
    if (options?.orderBy) {
      url.searchParams.set('order', `${options.orderBy.column}.${options.orderBy.ascending === false ? 'desc' : 'asc'}`);
    }
    if (options?.limit) url.searchParams.set('limit', String(options.limit));
    for (const filter of options?.filters ?? []) {
      const operator = filter.operator ?? 'eq';
      url.searchParams.set(filter.column, `${operator}.${encodeFilterValue(filter.value)}`);
    }
    return url.toString();
  }

  private headers(extra?: Record<string, string>, useServiceRole = true) {
    const apiKey = useServiceRole ? this.serviceKey : this.anonKey;
    return {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation,resolution=merge-duplicates',
      ...extra,
    };
  }

  async select(table: string, options?: QueryOptions) {
    const response = await fetchSupabaseWithRetry(this.buildUrl(table, options), {
      headers: this.headers(),
    }, { label: `select ${table}` });
    if (!response.ok) throw new Error(`Supabase select failed for ${table}: ${response.status} ${await response.text()}`);
    return response.json();
  }

  async upsert(table: string, rows: unknown[], onConflict?: string) {
    const payload = dedupeUpsertRows(rows, onConflict);
    if (!payload.length) return [];
    const url = new URL(this.buildUrl(table));
    if (onConflict) url.searchParams.set('on_conflict', onConflict);
    const response = await fetchSupabaseWithRetry(url, {
      method: 'POST',
      headers: this.headers({ Prefer: 'return=representation,resolution=merge-duplicates' }),
      body: JSON.stringify(payload),
    }, { label: `upsert ${table}` });
    if (!response.ok) throw new Error(`Supabase upsert failed for ${table}: ${response.status} ${await response.text()}`);
    return response.json().catch(() => []);
  }

  async insert(table: string, rows: unknown[]) {
    if (!rows.length) return [];
    const response = await fetch(this.buildUrl(table), {
      method: 'POST',
      headers: this.headers({ Prefer: 'return=representation' }),
      body: JSON.stringify(rows),
    });
    if (!response.ok) throw new Error(`Supabase insert failed for ${table}: ${response.status} ${await response.text()}`);
    return response.json().catch(() => []);
  }

  async delete(table: string, filters: NonNullable<QueryOptions['filters']>) {
    const response = await fetchSupabaseWithRetry(this.buildUrl(table, { filters }), {
      method: 'DELETE',
      headers: this.headers({ Prefer: 'return=representation' }),
    }, { label: `delete ${table}` });
    if (!response.ok) throw new Error(`Supabase delete failed for ${table}: ${response.status} ${await response.text()}`);
    return response.json().catch(() => []);
  }

  async update(table: string, payload: Record<string, unknown>, filters: NonNullable<QueryOptions['filters']>) {
    const response = await fetchSupabaseWithRetry(this.buildUrl(table, { filters }), {
      method: 'PATCH',
      headers: this.headers({ Prefer: 'return=representation' }),
      body: JSON.stringify(payload),
    }, { label: `update ${table}` });
    if (!response.ok) throw new Error(`Supabase update failed for ${table}: ${response.status} ${await response.text()}`);
    return response.json().catch(() => []);
  }

  async rpc<T = unknown>(fn: string, args: Record<string, unknown>) {
    const response = await fetch(`${this.baseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(args),
    });
    if (!response.ok) throw new Error(`Supabase rpc failed for ${fn}: ${response.status} ${await response.text()}`);
    return response.json() as Promise<T>;
  }
}

export const getSupabaseClient = () => {
  if (!env.supabaseUrl || !(env.supabaseServiceRoleKey || env.supabaseAnonKey)) {
    return null;
  }

  return new SupabaseRestClient(
    env.supabaseUrl,
    env.supabaseServiceRoleKey || env.supabaseAnonKey,
    env.supabaseAnonKey || env.supabaseServiceRoleKey,
  );
};
