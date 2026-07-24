import type { VercelRequest, VercelResponse } from './vercelTypes.js';

const RUNTIME_VERSION = 'qsa-fallback-ingestion-v1';

const requestValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const booleanValue = (value: string | undefined) => ['1', 'true', 'yes'].includes(String(value ?? '').toLowerCase());

const isAuthorized = (req: VercelRequest) => {
  const secret = process.env.CRON_SECRET;
  const authorization = req.headers.authorization;
  return Boolean(secret && authorization === `Bearer ${secret}`);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Origination-Runtime', RUNTIME_VERSION);

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ status: 'error', error: 'method_not_allowed' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ status: 'error', error: 'unauthorized' });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({
      status: 'blocked',
      error: 'supabase_service_credentials_missing',
      runtimeVersion: RUNTIME_VERSION,
    });
  }

  try {
    const companyId = requestValue(req.query.companyId);
    const force = booleanValue(requestValue(req.query.force));
    const maxCompaniesRaw = Number(requestValue(req.query.maxCompanies) ?? '500');
    const maxCompanies = Number.isFinite(maxCompaniesRaw)
      ? Math.max(1, Math.min(Math.trunc(maxCompaniesRaw), 5_000))
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
      runtimeVersion: RUNTIME_VERSION,
    });
  } catch (error) {
    console.error('[qsa-fallback-run]', error);
    return res.status(500).json({
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      runtimeVersion: RUNTIME_VERSION,
    });
  }
}
