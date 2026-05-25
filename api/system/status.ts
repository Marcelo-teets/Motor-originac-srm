import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifySupabaseJwt } from '../../backend/src/lib/auth.js';
import { getSupabaseClient } from '../../backend/src/lib/supabase.js';

type StatusKind = 'real' | 'partial' | 'mock';

type SystemStatusData = {
  supabase: { connected: boolean; latency_ms: number };
  auth: { working: boolean };
  capture: { last_run: string | null; status: 'real' | 'partial' };
  monitoring: { active_sources: number; outputs_24h: number };
  pipeline: { rows: number };
  watchlist: { count: number; items_count: number };
};

const write = (res: ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const emptyData = (authOk: boolean): SystemStatusData => ({
  supabase: { connected: false, latency_ms: 0 },
  auth: { working: authOk },
  capture: { last_run: null, status: 'partial' },
  monitoring: { active_sources: 0, outputs_24h: 0 },
  pipeline: { rows: 0 },
  watchlist: { count: 0, items_count: 0 },
});

const tokenFrom = (req: IncomingMessage) => {
  const raw = req.headers.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.split(' ').pop() ?? null;
};

const latestIso = (values: Array<string | null | undefined>) => values
  .filter((value): value is string => Boolean(value))
  .map((value) => new Date(value))
  .filter((value) => !Number.isNaN(value.getTime()))
  .sort((a, b) => b.getTime() - a.getTime())[0]?.toISOString() ?? null;

const inLast24h = (value?: string | null) => {
  if (!value) return false;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) && parsed >= Date.now() - 24 * 60 * 60 * 1000;
};

async function rows<T>(table: string, select: string): Promise<T[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const result = await client.select(table, { select });
  return Array.isArray(result) ? result as T[] : [];
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const generatedAt = new Date().toISOString();
  const token = tokenFrom(req);

  try {
    if (!token) {
      write(res, 401, { status: 'partial' satisfies StatusKind, generatedAt, data: emptyData(false), error: 'Missing token.' });
      return;
    }

    await verifySupabaseJwt(token);
    const started = Date.now();
    const companies = await rows<{ id: string }>('companies', 'id');
    const latency = Date.now() - started;

    const [sources, outputs, runs, states, pipeline, watchlists, watchlistItems] = await Promise.all([
      rows<{ status: string | null }>('source_catalog', 'status'),
      rows<{ observed_at?: string | null; created_at?: string | null }>('monitoring_outputs', 'observed_at,created_at'),
      rows<{ started_at?: string | null; finished_at?: string | null }>('source_connector_runs', 'started_at,finished_at,status'),
      rows<{ last_checked_at?: string | null; last_success_at?: string | null }>('monitoring_state', 'last_checked_at,last_success_at,status'),
      rows<{ id: string }>('pipeline', 'id'),
      rows<{ id: string }>('watchlists', 'id'),
      rows<{ id: string }>('watchlist_companies', 'id'),
    ]);

    const lastRun = latestIso([
      ...runs.flatMap((run) => [run.finished_at, run.started_at]),
      ...states.flatMap((state) => [state.last_success_at, state.last_checked_at]),
      ...outputs.flatMap((output) => [output.observed_at, output.created_at]),
    ]);

    const data: SystemStatusData = {
      supabase: { connected: companies.length > 0, latency_ms: latency },
      auth: { working: true },
      capture: { last_run: lastRun, status: lastRun ? 'real' : 'partial' },
      monitoring: {
        active_sources: sources.filter((source) => (source.status ?? '').toLowerCase() === 'active').length,
        outputs_24h: outputs.filter((output) => inLast24h(output.observed_at ?? output.created_at)).length,
      },
      pipeline: { rows: pipeline.length },
      watchlist: { count: watchlists.length, items_count: watchlistItems.length },
    };

    write(res, 200, { status: data.supabase.connected ? 'real' : 'partial', generatedAt, data });
  } catch (error) {
    write(res, 500, {
      status: 'partial' satisfies StatusKind,
      generatedAt,
      data: emptyData(false),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
