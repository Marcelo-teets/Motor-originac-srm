import type { IncomingMessage, ServerResponse } from 'node:http';

const RUNTIME = 'bounded-capture-run-v2';

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

const parseRequestUrl = (req: IncomingMessage) => {
  const host = getHeader(req, 'host') ?? 'localhost';
  return new URL((req as { url?: string }).url ?? '/', `https://${host}`);
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if ((req.method ?? 'GET').toUpperCase() !== 'POST') {
    writeJson(res, 405, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Method not allowed.' });
    return;
  }
  if (!authorized(req)) {
    writeJson(res, 401, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Unauthorized bounded capture request.' });
    return;
  }

  const startedAt = new Date().toISOString();
  const url = parseRequestUrl(req);
  const companyId = url.searchParams.get('companyId');
  const sourceId = url.searchParams.get('sourceId');

  try {
    const [
      { createPlatformRepository },
      { CaptureRuntimeService },
      { assertBoundedCaptureScope, withCaptureDeadline },
      { writeCaptureAudit },
      { withBoundedExternalFetch, BOUNDED_EXTERNAL_FETCH_TIMEOUT_MS },
    ] = await Promise.all([
      import('../backend/src/repositories/platformRepository.js'),
      import('../backend/src/services/captureRuntimeService.js'),
      import('../backend/src/lib/boundedCapture.js'),
      import('../backend/src/lib/captureAudit.js'),
      import('../backend/src/lib/boundedExternalFetch.js'),
    ]);

    assertBoundedCaptureScope(companyId, sourceId);
    const repository = createPlatformRepository(process.env.USE_SUPABASE === 'true' ? 'supabase' : 'memory');
    const runtime = new CaptureRuntimeService(repository);
    const result = await withBoundedExternalFetch(
      () => withCaptureDeadline(runtime.run({
        companyId: companyId!,
        sourceId: sourceId!,
        triggerType: 'cron',
        reason: 'github_actions_bounded_fanout',
      })),
    );
    const persistedErrors = Array.isArray(result.persisted.errors) ? result.persisted.errors : [];
    const statusCode = result.persisted.status === 'real' ? 200 : 207;

    await writeCaptureAudit({
      triggerType: 'cron',
      status: result.persisted.status === 'real' ? 'completed' : 'partial',
      startedAt,
      finishedAt: new Date().toISOString(),
      companyId: companyId!,
      sourceId: sourceId!,
      itemsCollected: result.outputsCollected,
      outputsWritten: result.persisted.outputsWritten,
      signalsWritten: result.persisted.signalsWritten,
      enrichmentsWritten: result.persisted.enrichmentsWritten,
      errorMessage: persistedErrors.length ? persistedErrors.slice(0, 3).join(' | ') : null,
      metadata: {
        auditVersion: 'bounded_capture_fanout_v2',
        runtime: RUNTIME,
        externalFetchTimeoutMs: BOUNDED_EXTERNAL_FETCH_TIMEOUT_MS,
        requested: result.requested,
        companiesProcessed: result.companiesProcessed,
        documentsCollected: result.documentsCollected,
        persisted: result.persisted,
      },
    });

    writeJson(res, statusCode, {
      status: result.persisted.status,
      generatedAt: new Date().toISOString(),
      data: result,
    });
  } catch (error) {
    const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
      ? Number((error as { statusCode?: unknown }).statusCode) || 500
      : 500;
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : 'bounded_capture_failed';
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (companyId && sourceId) {
      try {
        const { writeCaptureAudit } = await import('../backend/src/lib/captureAudit.js');
        await writeCaptureAudit({
          triggerType: 'cron',
          status: 'failed',
          startedAt,
          finishedAt: new Date().toISOString(),
          companyId,
          sourceId,
          errorMessage,
          metadata: {
            auditVersion: 'bounded_capture_fanout_v2',
            runtime: RUNTIME,
            code,
            retryable: statusCode === 504,
          },
        });
      } catch (auditError) {
        console.warn('[bounded-capture-run-audit]', auditError);
      }
    }

    console.error('[bounded-capture-run]', { companyId, sourceId, code, error: errorMessage });
    writeJson(res, statusCode, {
      status: 'partial',
      generatedAt: new Date().toISOString(),
      error: errorMessage,
      code,
      retryable: statusCode === 504,
      requested: { companyId, sourceId },
    });
  }
}
