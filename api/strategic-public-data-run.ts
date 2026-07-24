import type { VercelRequest, VercelResponse } from './vercelTypes.js';

// Node 24 emits DEP0169 from a legacy transitive dependency during ZIP discovery.
// The handler and connectors use WHATWG URL; filter only that known warning code.
const originalEmitWarning = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
  const code = typeof args[0] === 'object' && args[0] !== null
    ? (args[0] as { code?: string }).code
    : typeof args[1] === 'string' ? args[1] : undefined;
  if (code === 'DEP0169') return;
  return originalEmitWarning(warning as string, ...(args as [never]));
}) as typeof process.emitWarning;

const DATASET = 'cvm_fre_capital_structure' as const;
const RUNTIME_VERSION = 'strategic-public-data-v3';
const ALLOWED_MODES = ['run', 'probe', 'qsa-fallback'] as const;

const requestValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const booleanValue = (value: string | undefined) => ['1', 'true', 'yes'].includes(String(value ?? '').toLowerCase());

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
  if (!ALLOWED_MODES.includes(mode as typeof ALLOWED_MODES[number])) {
    return res.status(400).json({ status: 'error', error: 'invalid_mode', allowed: ALLOWED_MODES });
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

    if (mode === 'qsa-fallback') {
      const companyId = requestValue(req.query.companyId);
      const force = booleanValue(requestValue(req.query.force));
      const parsedMaxCompanies = Number(requestValue(req.query.maxCompanies) ?? '500');
      const maxCompanies = Number.isFinite(parsedMaxCompanies)
        ? Math.max(1, Math.min(Math.trunc(parsedMaxCompanies), 5_000))
        : 500;
      const { QsaFallbackIngestionService } = await import('../backend/src/services/qsaFallbackIngestionService.js');
      const result = await new QsaFallbackIngestionService().run({
        companyId,
        force,
        maxCompanies,
        triggerType: req.headers['x-vercel-cron'] ? 'schedule' : 'manual',
      });
      const statusCode = result.status === 'real' ? 200 : result.status === 'partial' ? 207 : 500;
      return res.status(statusCode).json({
        ...result,
        mode,
        runtime: 'vercel_node_dynamic_esm',
        runtimeVersion: RUNTIME_VERSION,
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
      mode,
      runtime: 'vercel_node_dynamic_esm',
      runtimeVersion: RUNTIME_VERSION,
      downstream,
    });
  } catch (error) {
    console.error('[strategic-public-data-run]', error);
    return res.status(500).json({
      status: 'failed',
      mode,
      datasetCode: mode === 'qsa-fallback' ? 'rfb_qsa_fallback' : DATASET,
      runtimeVersion: RUNTIME_VERSION,
      startedAt,
      finishedAt: new Date().toISOString(),
      error: errorMessage(error),
    });
  }
}
