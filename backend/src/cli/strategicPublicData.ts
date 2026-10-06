import { PublicDataDownstreamService } from '../services/publicDataDownstreamService.js';
import { StrategicPublicIngestionService } from '../services/strategicPublicIngestionService.js';
import type { StrategicPublicDatasetCode } from '../modules/public-data/strategicPublicDatasetConnector.js';
import { parseCliArgs } from './args.js';

const DATASETS: StrategicPublicDatasetCode[] = [
  'rfb_qsa',
  'cvm_fre_capital_structure',
];

const { args, valueFor, positiveNumber } = parseCliArgs();

const datasetArgument = valueFor('dataset') ?? 'all';
const datasets = datasetArgument === 'all'
  ? DATASETS
  : datasetArgument.split(',').map((value) => value.trim()).filter(Boolean) as StrategicPublicDatasetCode[];
const invalid = datasets.filter((dataset) => !DATASETS.includes(dataset));
if (invalid.length) throw new Error(`Invalid strategic dataset(s): ${invalid.join(', ')}.`);

const discoverOnly = args.includes('--discover-only');
const ingestion = await new StrategicPublicIngestionService().run({
  datasets,
  reference: valueFor('reference'),
  maxMatchedRows: positiveNumber('max-matched-rows', 100_000),
  maxResources: positiveNumber('max-resources', 20),
  triggerType: (valueFor('trigger') as 'manual' | 'schedule' | 'backfill' | undefined) ?? 'manual',
  discoverOnly,
  fullCoverage: args.includes('--full-coverage'),
});

const downstream = discoverOnly || ingestion.status === 'failed'
  ? null
  : await new PublicDataDownstreamService().sync(datasets);

const result = { ...ingestion, downstream };
console.log(JSON.stringify(result, null, 2));

if (ingestion.status === 'failed' || downstream?.status === 'partial') process.exitCode = 1;
if (args.includes('--require-scan') && ingestion.totals.rowsScanned <= 0) {
  console.error('Strategic public-data ingestion completed without scanning source rows.');
  process.exitCode = 1;
}
if (args.includes('--require-matches') && ingestion.totals.recordsMatched <= 0) {
  console.error('Strategic public-data ingestion completed without matching Company Master CNPJs.');
  process.exitCode = 1;
}
