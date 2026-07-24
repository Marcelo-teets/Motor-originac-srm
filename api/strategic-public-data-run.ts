import type { VercelRequest, VercelResponse } from './vercelTypes.js';

const DATASET = 'cvm_fre_capital_structure' as const;
const RUNTIME_VERSION = 'strategic-public-data-v2';

const requestValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

const isAuthorized = (req: VercelRequest) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authorization = req.headers.authorization;
  return authorization === `Bearer ${secret}`;
};

const isProtectedPreviewProbe = (mode: string) => mode === 'probe' && process.env.VERCEL_ENV === 'preview';
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Origination-Runtime', RUNTIME_VERSION);
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ status: 'error', error: 'method_not_allowed' });
  }

  const mode = requestValue(req.query.mode) ?? 'run';
  if (!['run', 'probe'].includes(mode)) {
    return res.status(400).json({ status: 'error', error: 'invalid_mode', allowed: ['run', 'probe'] });
  }
  if (!isAuthorized(req) && !isProtectedPreviewProbe(mode)) {
    return res.status(401).json({ status: 'error', error: 'unauthorized' });
  }

  const reference = requestValue(req.query.reference);
  const startedAt = new Date().toISOString();

  try {
    if (mode === 'probe') {
      const connector = await import('../backend/src/modules/public-data/strategicPublicDatasetConnector.js');
      const resources = await connector.discoverStrategicPublicResources(DATASET, {
        reference,
        maxResources: 1,
      });
      const resource = resources[0];
      const stats = await connector.streamStrategicPublicResource({
        datasetCode: DATASET,
        resource,
        targetCnpjs: new Set(),
        targetRoots: new Set(),
        maxMatchedRows: 1,
        onRecord: async () => undefined,
      });
      return res.status(200).json({
        status: 'real',
        mode: 'probe',
        datasetCode: DATASET,
        runtime: 'vercel_node_dynamic_esm',
        runtimeVersion: RUNTIME_VERSION,
        startedAt,
        finishedAt: new Date().toISOString(),
        resource: {
          key: resource.key,
          name: resource.name,
          url: resource.url,
          referenceDate: resource.referenceDate,
          modifiedAt: resource.modifiedAt ?? null,
          etag: resource.etag ?? null,
        },
        stats,
        persisted: false,
      });
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(503).json({
        status: 'blocked',
        error: 'supabase_service_credentials_missing',
        environment: {
          hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
          hasSupabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
          hasCronSecret: Boolean(process.env.CRON_SECRET),
        },
      });
    }

    const [{ StrategicPublicIngestionService }, { PublicDataDownstreamService }] = await Promise.all([
      import('../backend/src/services/strategicPublicIngestionService.js'),
      import('../backend/src/services/publicDataDownstreamService.js'),
    ]);

    const ingestion = await new StrategicPublicIngestionService().run({
      datasets: [DATASET],
      reference,
      maxMatchedRows: 100_000,
      maxResources: 1,
      triggerType: 'schedule',
      discoverOnly: false,
      fullCoverage: true,
    });
    const downstream = ingestion.status === 'failed'
      ? null
      : await new PublicDataDownstreamService().sync([DATASET]);
    const statusCode = ingestion.status === 'failed'
      ? 500
      : ingestion.status === 'partial' || downstream?.status === 'partial' ? 207 : 200;

    return res.status(statusCode).json({
      ...ingestion,
      runtime: 'vercel_node_dynamic_esm',
      runtimeVersion: RUNTIME_VERSION,
      downstream,
    });
  } catch (error) {
    console.error('[strategic-public-data-run]', error);
    return res.status(500).json({
      status: 'failed',
      mode,
      datasetCode: DATASET,
      runtimeVersion: RUNTIME_VERSION,
      startedAt,
      finishedAt: new Date().toISOString(),
      error: errorMessage(error),
    });
  }
}
