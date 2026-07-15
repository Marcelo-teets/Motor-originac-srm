import type { IncomingMessage, ServerResponse } from 'node:http';

const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
};

const getHeader = (req: IncomingMessage, key: string) => {
  const value = req.headers[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const isAuthorized = (req: IncomingMessage) => {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && getHeader(req, 'authorization') === `Bearer ${secret}`);
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!isAuthorized(req)) {
    writeJson(res, 401, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Unauthorized capital-market ingestion request.' });
    return;
  }

  const host = getHeader(req, 'host') ?? 'localhost';
  const url = new URL((req as any).url ?? '/', `https://${host}`);
  const requestedDataset = String(url.searchParams.get('dataset') ?? 'cvm_offers');

  try {
    const [{ CVM_DATASETS }, { CapitalMarketIngestionService }] = await Promise.all([
      import('../backend/src/modules/capital-markets/cvmCapitalMarketConnector.js'),
      import('../backend/src/services/capitalMarketIngestionService.js'),
    ]);

    if (!Object.prototype.hasOwnProperty.call(CVM_DATASETS, requestedDataset)) {
      writeJson(res, 400, {
        status: 'partial',
        generatedAt: new Date().toISOString(),
        error: `Invalid dataset: ${requestedDataset}`,
        allowedDatasets: Object.keys(CVM_DATASETS),
      });
      return;
    }

    const parsedMaxRows = Number(url.searchParams.get('maxRows') ?? '1000');
    const maxRows = Number.isFinite(parsedMaxRows) ? Math.max(1, Math.min(Math.trunc(parsedMaxRows), 5_000)) : 1_000;
    const reference = url.searchParams.get('reference') ?? undefined;
    const dataset = requestedDataset as keyof typeof CVM_DATASETS;

    const result = await new CapitalMarketIngestionService().run({
      datasets: [dataset],
      reference,
      maxRows,
      triggerType: 'manual',
    });
    writeJson(res, result.status === 'real' ? 200 : result.status === 'partial' ? 207 : 500, result);
  } catch (error) {
    writeJson(res, 500, {
      status: 'failed',
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
