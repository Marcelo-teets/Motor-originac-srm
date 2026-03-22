import { env } from './env.js';

type QueryOptions = {
  select?: string;
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
  filters?: FilterDefinition[];
};

type FilterDefinition = {
  column: string;
  operator?: 'eq' | 'in' | 'is';
  value: string | number | boolean | null | Array<string | number>;
};

const encodeFilterValue = (value: FilterDefinition['value']) => {
  if (Array.isArray(value)) return `(${value.map((item) => `"${String(item).replaceAll('"', '\\"')}"`).join(',')})`;
  if (value === null) return 'null';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  return String(value);
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
    const response = await fetch(this.buildUrl(table, options), { headers: this.headers() });
    if (!response.ok) throw new Error(`Supabase select failed for ${table}: ${response.status} ${await response.text()}`);
    return response.json();
  }

  async upsert(table: string, rows: unknown[], onConflict?: string) {
    if (!rows.length) return [];
    const url = new URL(this.buildUrl(table));
    if (onConflict) url.searchParams.set('on_conflict', onConflict);
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: this.headers({ Prefer: 'return=representation,resolution=merge-duplicates' }),
      body: JSON.stringify(rows),
    });
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
    const response = await fetch(this.buildUrl(table, { filters }), {
      method: 'DELETE',
      headers: this.headers({ Prefer: 'return=representation' }),
    });
    if (!response.ok) throw new Error(`Supabase delete failed for ${table}: ${response.status} ${await response.text()}`);
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
