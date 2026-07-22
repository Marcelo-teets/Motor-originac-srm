import {
  discoverStrategicPublicResources,
  streamStrategicPublicResource,
  type StrategicPublicDatasetCode,
} from '../modules/public-data/strategicPublicDatasetConnector.js';

const args = process.argv.slice(2);
const valueFor = (name: string) => {
  const inline = args.find((argument) => argument.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const dataset = (valueFor('dataset') ?? 'cvm_fre_capital_structure') as StrategicPublicDatasetCode;
if (dataset !== 'cvm_fre_capital_structure') {
  throw new Error('The dependency-free official probe is intentionally restricted to cvm_fre_capital_structure.');
}

const resources = await discoverStrategicPublicResources(dataset, {
  reference: valueFor('reference'),
  maxResources: 1,
});
const resource = resources[0];
const startedAt = new Date().toISOString();
const stats = await streamStrategicPublicResource({
  datasetCode: dataset,
  resource,
  targetCnpjs: new Set(),
  targetRoots: new Set(),
  maxMatchedRows: 1,
  onRecord: async () => undefined,
});

const result = {
  status: stats.rowsScanned > 0 && stats.archiveEntries > 0 ? 'real' : 'failed',
  mode: 'official_source_probe',
  datasetCode: dataset,
  startedAt,
  finishedAt: new Date().toISOString(),
  resource: {
    key: resource.key,
    name: resource.name,
    url: resource.url,
    referenceDate: resource.referenceDate,
    modifiedAt: resource.modifiedAt ?? null,
    etag: resource.etag ?? null,
  },
  stats,
  persisted: false,
};
console.log(JSON.stringify(result, null, 2));

if (result.status !== 'real') process.exitCode = 1;
