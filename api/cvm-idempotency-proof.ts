import type { IncomingMessage, ServerResponse } from 'node:http';

const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (process.env.VERCEL_ENV !== 'preview') {
    writeJson(res, 404, { status: 'not_found' });
    return;
  }

  if (req.method !== 'GET') {
    writeJson(res, 405, { status: 'partial', error: 'Method not allowed.' });
    return;
  }

  const host = req.headers.host ?? 'localhost';
  const url = new URL((req as any).url ?? '/', `https://${host}`);
  const pass = url.searchParams.get('pass');
  if (pass !== 'first' && pass !== 'second') {
    writeJson(res, 400, { status: 'partial', error: 'pass must be first or second.' });
    return;
  }

  try {
    const { CapitalMarketIngestionService } = await import('../backend/src/services/capitalMarketIngestionService.js');
    const result = await new CapitalMarketIngestionService().run({
      datasets: ['cvm_offers'],
      maxRows: 250,
      triggerType: 'manual',
    });

    if (result.status === 'failed' || result.totals.recordsSeen <= 0) {
      writeJson(res, 500, { ...result, proof: 'failed', pass });
      return;
    }

    if (pass === 'second') {
      const hasWrites = result.totals.eventsWritten > 0
        || result.totals.recordsInserted > 0
        || result.totals.recordsUpdated > 0;
      const provedUnchanged = result.totals.recordsUnchanged > 0 || result.totals.resourcesSkipped > 0;
      if (hasWrites || !provedUnchanged) {
        writeJson(res, 409, { ...result, proof: 'not_idempotent', pass });
        return;
      }
    }

    writeJson(res, 200, {
      ...result,
      proof: pass === 'first' ? 'canonical_write_completed' : 'idempotency_confirmed',
      pass,
      deploymentCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    });
  } catch (error) {
    writeJson(res, 500, {
      status: 'failed',
      proof: 'runtime_error',
      pass,
      error: error instanceof Error ? error.message : String(error),
      deploymentCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    });
  }
}
