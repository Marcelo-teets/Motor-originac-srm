import type { IncomingMessage, ServerResponse } from 'node:http';

const RUNTIME = 'bounded-capture-targets-v1';

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
    const useSupabase = process.env.USE_SUPABASE === 'true';
    const repository = createPlatformRepository(useSupabase ? 'supabase' : 'memory');
    const [allCompanies, allSources] = await Promise.all([
      repository.listCompanies(),
      repository.listSources(),
    ]);
    const companies = selectMonitoringCompanies(allCompanies, useSupabase);
    const sources = selectCaptureSources(allSources);
    const targets = buildBoundedCaptureTargets(allCompanies, allSources, useSupabase);

    writeJson(res, 200, {
      status: useSupabase ? 'real' : 'partial',
      generatedAt: new Date().toISOString(),
      data: {
        policy: {
          boundedScopeRequired: true,
          maxParallelism: 3,
          sourceStatus: 'real',
          sourceHealth: 'healthy',
          companyGate: useSupabase ? 'monitoring_eligible' : 'memory_fallback',
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
