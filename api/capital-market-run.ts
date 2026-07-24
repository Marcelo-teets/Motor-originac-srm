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

const deploymentMetadata = () => ({
  deploymentCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  deploymentEnvironment: process.env.VERCEL_ENV ?? null,
  deploymentUrl: process.env.VERCEL_URL ?? null,
});

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!isAuthorized(req)) {
    writeJson(res, 401, {
      status: 'partial',
      generatedAt: new Date().toISOString(),
      error: 'Unauthorized capital-market ingestion request.',
      ...deploymentMetadata(),
    });
    return;
  }

  const host = getHeader(req, 'host') ?? 'localhost';
  const url = new URL((req as any).url ?? '/', `https://${host}`);
  const requestedDataset = String(url.searchParams.get('dataset') ?? 'cvm_offers');
  const mode = String(url.searchParams.get('mode') ?? 'run');

  try {
    const connector = await import('../backend/src/modules/capital-markets/cvmCapitalMarketConnector.js');
    const { CVM_DATASETS } = connector;

    if (!Object.prototype.hasOwnProperty.call(CVM_DATASETS, requestedDataset)) {
      writeJson(res, 400, {
        status: 'partial',
        generatedAt: new Date().toISOString(),
        error: `Invalid dataset: ${requestedDataset}`,
        allowedDatasets: Object.keys(CVM_DATASETS),
        ...deploymentMetadata(),
      });
      return;
    }

    const reference = url.searchParams.get('reference') ?? undefined;
    const dataset = requestedDataset as keyof typeof CVM_DATASETS;

    if (mode === 'probe') {
      const resources = await connector.discoverCvmResources(dataset, reference);
      writeJson(res, 200, {
        status: 'real',
        probe: 'ok',
        generatedAt: new Date().toISOString(),
        dataset,
        reference: reference ?? null,
        resources: resources.map((resource) => ({
          id: resource.id ?? null,
          name: resource.name,
          format: resource.format ?? null,
          lastModified: resource.last_modified ?? null,
        })),
        ...deploymentMetadata(),
      });
      return;
    }

    if (mode !== 'run') {
      writeJson(res, 400, {
        status: 'partial',
        generatedAt: new Date().toISOString(),
        error: `Invalid mode: ${mode}`,
        allowedModes: ['run', 'probe'],
        ...deploymentMetadata(),
      });
      return;
    }

    const parsedMaxRows = Number(url.searchParams.get('maxRows') ?? '1000');
    const maxRows = Number.isFinite(parsedMaxRows) ? Math.max(1, Math.min(Math.trunc(parsedMaxRows), 5_000)) : 1_000;
    const { CapitalMarketIngestionService } = await import('../backend/src/services/capitalMarketIngestionService.js');
    const ingestion = await new CapitalMarketIngestionService().run({
      datasets: [dataset],
      reference,
      maxRows,
      triggerType: 'manual',
    });

    const deliveryDatasets = ingestion.datasets
      .filter((item) => item.status !== 'failed')
      .map((item) => item.datasetCode);
    const { CapitalMarketDeliveryService } = await import('../backend/src/services/capitalMarketDeliveryService.js');
    const delivery = await new CapitalMarketDeliveryService().sync(deliveryDatasets);
    const status = ingestion.status === 'failed' || delivery.status === 'failed'
      ? 'failed'
      : ingestion.status === 'partial' || delivery.status === 'partial'
        ? 'partial'
        : 'real';

    writeJson(res, status === 'real' ? 200 : status === 'partial' ? 207 : 500, {
      ...ingestion,
      status,
      delivery,
      ...deploymentMetadata(),
    });
  } catch (error) {
    writeJson(res, 500, {
      status: 'failed',
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
      ...deploymentMetadata(),
    });
  }
}
