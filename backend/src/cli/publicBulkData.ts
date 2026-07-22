import {
  type PublicBulkDatasetCode,
} from '../modules/public-data/publicBulkDatasetConnector.js';
import { PublicBulkIngestionService } from '../services/publicBulkIngestionService.js';
import { PublicDataDownstreamService } from '../services/publicDataDownstreamService.js';

const DATASETS: PublicBulkDatasetCode[] = [
  'rfb_cnpj',
  'pgfn_debt',
  'bndes_financing_operations',
  'cgu_ceis',
  'cgu_cnep',
  'compras_contracts',
];

const args = process.argv.slice(2);
const valueFor = (name: string) => {
  const inline = args.find((argument) => argument.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const datasetArgument = valueFor('dataset') ?? 'all';
const datasets = datasetArgument === 'all'
  ? DATASETS
  : datasetArgument.split(',').map((value) => value.trim()).filter(Boolean) as PublicBulkDatasetCode[];
const invalid = datasets.filter((dataset) => !DATASETS.includes(dataset));
if (invalid.length) throw new Error(`Invalid dataset(s): ${invalid.join(', ')}.`);

const positiveNumber = (name: string, fallback: number) => {
  const value = Number(valueFor(name) ?? fallback);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`--${name} must be a positive number.`);
  return value;
};

const discoverOnly = args.includes('--discover-only');
const ingestion = await new PublicBulkIngestionService().run({
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

const result = {
  ...ingestion,
  downstream,
};

console.log(JSON.stringify(result, null, 2));
if (ingestion.status === 'failed' || downstream?.status === 'partial') process.exitCode = 1;
if (args.includes('--require-scan') && ingestion.totals.rowsScanned <= 0) {
  console.error('Public bulk ingestion completed without scanning source rows.');
  process.exitCode = 1;
}
if (args.includes('--require-matches') && ingestion.totals.recordsMatched <= 0) {
  console.error('Public bulk ingestion completed without matching Company Master CNPJs.');
  process.exitCode = 1;
}
