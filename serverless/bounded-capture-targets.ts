import type { IncomingMessage, ServerResponse } from 'node:http';

const RUNTIME = 'bounded-capture-targets-v2';

const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Origination-Runtime': RUNTIME,
    'X-Robots-Tag': 'noindex',
  });
  res.end(JSON.stringify(payload));
};

const getHeader = (req: IncomingMessage, key: string) => {
  const value = req.headers[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const authorized = (req: IncomingMessage) => {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && getHeader(req, 'authorization') === `Bearer ${secret}`);
};

const cadenceFrom = (req: IncomingMessage) => {
  const value = new URL(req.url ?? '/', 'https://runtime.local').searchParams.get('cadence') ?? 'all';
  return new Set(['frequent', 'daily', 'weekly', 'monthly', 'all']).has(value) ? value : 'all';
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if ((req.method ?? 'GET').toUpperCase() !== 'GET') {
    writeJson(res, 405, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Method not allowed.' });
    return;
  }
  if (!authorized(req)) {
    writeJson(res, 401, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Unauthorized capture target request.' });
    return;
  }

  try {
    const [{ createPlatformRepository }, { buildBoundedCaptureTargets, selectCaptureSources, selectMonitoringCompanies }] = await Promise.all([
      import('../backend/src/repositories/platformRepository.js'),
      import('../backend/src/lib/boundedCapture.js'),
    ]);
    const usePersistentData = Boolean(process.env.MOTOR_NEON_DATABASE_URL || process.env.DATABASE_URL || (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)));
    const cadence = cadenceFrom(req) as 'frequent' | 'daily' | 'weekly' | 'monthly' | 'all';
    const repository = createPlatformRepository(usePersistentData ? 'database' : 'memory');
    const [allCompanies, allSources] = await Promise.all([
      repository.listCompanies(),
      repository.listSources(),
    ]);
    const companies = selectMonitoringCompanies(allCompanies, usePersistentData);
    const sources = selectCaptureSources(allSources, cadence);
    const targets = buildBoundedCaptureTargets(allCompanies, allSources, usePersistentData, cadence);

    writeJson(res, 200, {
      status: usePersistentData ? 'real' : 'partial',
      generatedAt: new Date().toISOString(),
      data: {
        policy: {
          boundedScopeRequired: true,
          maxParallelism: 3,
          sourceHealth: 'healthy',
          cadence,
          companyGate: usePersistentData ? 'monitoring_eligible' : 'memory_fallback',
        },
        companies: companies.map((company) => ({ id: company.id, name: company.tradeName })),
        sources: sources.map((source) => ({ id: source.id, name: source.name, category: source.category })),
        targets,
        counts: {
          companies: companies.length,
          sources: sources.length,
          targets: targets.length,
        },
      },
    });
  } catch (error) {
    console.error('[bounded-capture-targets]', error);
    writeJson(res, 500, {
      status: 'partial',
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
