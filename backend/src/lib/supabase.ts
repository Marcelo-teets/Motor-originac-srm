import { env } from './env.js';

type QueryOptions = {
  select?: string;
  orderBy?: { column: string; ascending?: boolean };
};

class SupabaseRestClient {
  constructor(private readonly baseUrl: string, private readonly apiKey: string) {}

  private buildUrl(table: string, options?: QueryOptions) {
    const url = new URL(`${this.baseUrl}/rest/v1/${table}`);
    if (options?.select) url.searchParams.set('select', options.select);
    if (options?.orderBy) {
      url.searchParams.set('order', `${options.orderBy.column}.${options.orderBy.ascending === false ? 'desc' : 'asc'}`);
    }
    return url.toString();
  }

  private headers(extra?: Record<string, string>) {
    return {
      apikey: this.apiKey,
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation,resolution=merge-duplicates',
      ...extra,
    };
  }

  async select(table: string, options?: QueryOptions) {
    const response = await fetch(this.buildUrl(table, options), { headers: this.headers() });
    if (!response.ok) throw new Error(`Supabase select failed for ${table}: ${response.status}`);
    return response.json();
  }

  async upsert(table: string, rows: unknown[]) {
    const response = await fetch(this.buildUrl(table), {
      method: 'POST',
      headers: this.headers({ Prefer: 'resolution=merge-duplicates' }),
      body: JSON.stringify(rows),
    });
    if (!response.ok) throw new Error(`Supabase upsert failed for ${table}: ${response.status}`);
    return response.text();
  }
}

export const getSupabaseClient = () => {
  if (!env.supabaseUrl || !(env.supabaseServiceRoleKey || env.supabaseAnonKey)) {
    return null;
  }

  return new SupabaseRestClient(env.supabaseUrl, env.supabaseServiceRoleKey || env.supabaseAnonKey);
};
