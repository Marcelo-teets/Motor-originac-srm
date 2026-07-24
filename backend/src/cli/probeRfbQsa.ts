import {
  discoverStrategicPublicResources,
  streamStrategicPublicResource,
} from '../modules/public-data/strategicPublicDatasetConnector.js';
import { isValidCnpj, normalizeCnpj } from '../services/strategicPublicIngestionService.js';

const DATASET = 'rfb_qsa' as const;
const args = process.argv.slice(2);

const valueFor = (name: string) => {
  const inline = args.find((argument) => argument.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const integerOption = (name: string, fallback: number, maximum: number) => {
  const parsed = Number(valueFor(name) ?? fallback);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid --${name}: ${valueFor(name)}`);
  return Math.max(1, Math.min(Math.trunc(parsed), maximum));
};

const requestedCnpj = valueFor('cnpj');
if (!requestedCnpj || !isValidCnpj(requestedCnpj)) {
  throw new Error('A checksum-valid --cnpj is required for the RFB QSA probe.');
}

const cnpj = normalizeCnpj(requestedCnpj);
const root = cnpj.slice(0, 8);
const reference = valueFor('reference');
const maxResources = integerOption('max-resources', 20, 20);
const maxMatchedRows = integerOption('max-matched-rows', 1_000, 10_000);
const requireMatch = args.includes('--require-match');
const scanAll = args.includes('--scan-all');
const startedAt = new Date().toISOString();

const resources = await discoverStrategicPublicResources(DATASET, {
  reference,
  maxResources,
});

let rowsScanned = 0;
let recordsMatched = 0;
let archiveEntries = 0;
const recordTypes: Record<string, number> = {};
const resourceResults: Array<{
  key: string;
  name: string;
  referenceDate: string | null;
  rowsScanned: number;
  recordsMatched: number;
  archiveEntries: number;
}> = [];

for (const resource of resources) {
  const stats = await streamStrategicPublicResource({
    datasetCode: DATASET,
    resource,
    targetCnpjs: new Set([cnpj]),
    targetRoots: new Set([root]),
    maxMatchedRows: Math.max(1, maxMatchedRows - recordsMatched),
    onRecord: async (record) => {
      recordTypes[record.recordType] = (recordTypes[record.recordType] ?? 0) + 1;
    },
  });

  rowsScanned += stats.rowsScanned;
  recordsMatched += stats.recordsMatched;
  archiveEntries += stats.archiveEntries;
  resourceResults.push({
    key: resource.key,
    name: resource.name,
    referenceDate: resource.referenceDate,
    rowsScanned: stats.rowsScanned,
    recordsMatched: stats.recordsMatched,
    archiveEntries: stats.archiveEntries,
  });

  if (!scanAll && stats.recordsMatched > 0) break;
  if (recordsMatched >= maxMatchedRows) break;
}

const sourceReadable = rowsScanned > 0 && archiveEntries > 0;
const matchSatisfied = !requireMatch || recordsMatched > 0;
const status = sourceReadable && matchSatisfied ? 'real' : 'failed';
const result = {
  status,
  mode: 'official_qsa_probe',
  datasetCode: DATASET,
  startedAt,
  finishedAt: new Date().toISOString(),
  target: {
    cnpjRoot: root,
    fullCnpjFingerprint: `${cnpj.slice(0, 8)}******`,
  },
  requested: {
    reference: reference ?? null,
    maxResources,
    maxMatchedRows,
    requireMatch,
    scanAll,
  },
  totals: {
    resourcesDiscovered: resources.length,
    resourcesAttempted: resourceResults.length,
    rowsScanned,
    recordsMatched,
    archiveEntries,
    recordTypes,
  },
  resources: resourceResults,
  persisted: false,
  privacy: 'No partner document or raw QSA row is printed or persisted by this probe.',
};

console.log(JSON.stringify(result, null, 2));
if (status !== 'real') process.exitCode = 1;
