import { CVM_DATASETS, type CvmDatasetCode } from '../modules/capital-markets/cvmCapitalMarketConnector.js';
import { evaluateCapitalMarketDeliveryAssertions } from '../services/capitalMarketAssertions.js';
import { CapitalMarketDeliveryService } from '../services/capitalMarketDeliveryService.js';
import { CapitalMarketIngestionService } from '../services/capitalMarketIngestionService.js';
import { parseCliArgs } from './args.js';

const { args, valueFor } = parseCliArgs();

const datasetArgument = valueFor('dataset') ?? 'all';
const datasets = datasetArgument === 'all'
  ? Object.keys(CVM_DATASETS) as CvmDatasetCode[]
  : datasetArgument.split(',').map((value) => value.trim()).filter(Boolean) as CvmDatasetCode[];
const invalid = datasets.filter((dataset) => !CVM_DATASETS[dataset]);
if (invalid.length) throw new Error(`Invalid dataset(s): ${invalid.join(', ')}.`);

const maxRowsArgument = Number(valueFor('max-rows') ?? '100000');
if (!Number.isFinite(maxRowsArgument) || maxRowsArgument <= 0) throw new Error('--max-rows must be a positive number.');

const ingestion = await new CapitalMarketIngestionService().run({
  datasets,
  reference: valueFor('reference'),
  maxRows: maxRowsArgument,
  triggerType: (valueFor('trigger') as 'manual' | 'schedule' | 'backfill' | undefined) ?? 'manual',
});

const deliveryDatasets = ingestion.datasets
  .filter((dataset) => dataset.status !== 'failed')
  .map((dataset) => dataset.datasetCode);
const delivery = await new CapitalMarketDeliveryService().sync(deliveryDatasets);
const result = { ...ingestion, delivery };

console.log(JSON.stringify(result, null, 2));
if (ingestion.deferredDatasets.length) {
  console.warn(`Run-wide row budget exhausted; deferred datasets: ${ingestion.deferredDatasets.join(', ')}.`);
}
if (ingestion.status === 'failed' || delivery.status === 'failed') process.exitCode = 1;
if (args.includes('--require-records') && ingestion.totals.recordsSeen <= 0) {
  console.error('Capital-market ingestion completed without source records.');
  process.exitCode = 1;
}
if (args.includes('--require-delivery')) {
  const assertion = evaluateCapitalMarketDeliveryAssertions({
    // Datasets deferred by the run-wide row budget were never attempted; they are
    // not delivery failures and are picked up by the next run.
    requested: datasets.filter((dataset) => !ingestion.deferredDatasets.includes(dataset)),
    ingestion: ingestion.datasets,
    delivery: delivery.datasets,
  });

  if (!assertion.ok) {
    console.error(JSON.stringify({
      error: 'Capital-market delivery assertion failed.',
      ...assertion,
    }));
    process.exitCode = 1;
  }
}
if (args.includes('--require-idempotent')) {
  const hasWrites = ingestion.totals.eventsWritten > 0
    || ingestion.totals.recordsInserted > 0
    || ingestion.totals.recordsUpdated > 0;
  const provedUnchanged = ingestion.totals.recordsUnchanged > 0 || ingestion.totals.resourcesSkipped > 0;
  if (hasWrites || !provedUnchanged) {
    console.error(`Capital-market idempotency assertion failed: ${JSON.stringify(ingestion.totals)}`);
    process.exitCode = 1;
  }
}
