import { CVM_DATASETS, type CvmDatasetCode } from '../modules/capital-markets/cvmCapitalMarketConnector.js';
import { CapitalMarketIngestionService } from '../services/capitalMarketIngestionService.js';

const args = process.argv.slice(2);
const valueFor = (name: string) => {
  const inline = args.find((argument) => argument.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const datasetArgument = valueFor('dataset') ?? 'all';
const datasets = datasetArgument === 'all'
  ? Object.keys(CVM_DATASETS) as CvmDatasetCode[]
  : datasetArgument.split(',').map((value) => value.trim()).filter(Boolean) as CvmDatasetCode[];
const invalid = datasets.filter((dataset) => !CVM_DATASETS[dataset]);
if (invalid.length) throw new Error(`Invalid dataset(s): ${invalid.join(', ')}.`);

const maxRowsArgument = Number(valueFor('max-rows') ?? '100000');
if (!Number.isFinite(maxRowsArgument) || maxRowsArgument <= 0) throw new Error('--max-rows must be a positive number.');

const result = await new CapitalMarketIngestionService().run({
  datasets,
  reference: valueFor('reference'),
  maxRows: maxRowsArgument,
  triggerType: (valueFor('trigger') as 'manual' | 'schedule' | 'backfill' | undefined) ?? 'manual',
});

console.log(JSON.stringify(result, null, 2));
if (result.status === 'failed') process.exitCode = 1;
