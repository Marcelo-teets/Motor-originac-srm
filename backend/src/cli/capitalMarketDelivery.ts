import { CVM_DATASETS, type CvmDatasetCode } from '../modules/capital-markets/cvmCapitalMarketConnector.js';
import { CapitalMarketDeliveryService } from '../services/capitalMarketDeliveryService.js';

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

const result = await new CapitalMarketDeliveryService().sync(datasets);
console.log(JSON.stringify(result, null, 2));

if (result.status === 'failed') process.exitCode = 1;
if (args.includes('--require-delivery')) {
  const failed = result.datasets.filter((dataset) => dataset.status === 'failed');
  const missingEvents = result.datasets.filter((dataset) => dataset.eventCount <= 0);
  if (failed.length || missingEvents.length) {
    console.error(JSON.stringify({
      error: 'Capital-market delivery assertion failed.',
      failedDatasets: failed.map((dataset) => dataset.datasetCode),
      datasetsWithoutEvents: missingEvents.map((dataset) => dataset.datasetCode),
    }));
    process.exitCode = 1;
  }
}
