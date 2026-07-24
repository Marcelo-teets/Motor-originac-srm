import { fetchBrasilApiQsaFallback } from '../modules/public-data/brasilApiQsaFallback.js';
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
  throw new Error('A checksum-valid --cnpj is required for the QSA source-hierarchy probe.');
}

const cnpj = normalizeCnpj(requestedCnpj);
const root = cnpj.slice(0, 8);
const reference = valueFor('reference');
const maxResources = integerOption('max-resources', 20, 20);
const maxMatchedRows = integerOption('max-matched-rows', 1_000, 10_000);
const requireMatch = args.includes('--require-match');
const scanAll = args.includes('--scan-all');
const disableFallback = args.includes('--no-fallback');
const startedAt = new Date().toISOString();

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
let resourcesDiscovered = 0;
let primaryError: string | null = null;

try {
  const resources = await discoverStrategicPublicResources(DATASET, {
    reference,
    maxResources,
  });
  resourcesDiscovered = resources.length;

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
} catch (error) {
  primaryError = error instanceof Error ? error.message : String(error);
}

const primaryReadable = rowsScanned > 0 && archiveEntries > 0;
const primaryMatched = recordsMatched > 0;
const primarySucceeded = primaryReadable && (!requireMatch || primaryMatched);

const fallback = !primarySucceeded && !disableFallback
  ? await fetchBrasilApiQsaFallback(cnpj)
  : null;
const fallbackMatched = Boolean(fallback?.status === 'real' && fallback.records.length > 0);
const fallbackRecordTypes = fallback?.records.reduce<Record<string, number>>((accumulator, record) => {
  accumulator[record.recordType] = (accumulator[record.recordType] ?? 0) + 1;
  return accumulator;
}, {}) ?? {};

const status = primarySucceeded || fallbackMatched ? 'real' : 'failed';
const selectedSource = primarySucceeded
  ? 'rfb_official_bulk'
  : fallbackMatched ? 'brasilapi_qsa_fallback' : 'none';
const result = {
  status,
  mode: 'qsa_source_hierarchy_probe',
  datasetCode: DATASET,
  startedAt,
  finishedAt: new Date().toISOString(),
  target: {
    cnpjRoot: root,
    fullCnpjFingerprint: `${root}******`,
  },
  selectedSource,
  primary: {
    source: 'Receita Federal CNPJ bulk',
    sourceAuthority: 'official_primary',
    status: primarySucceeded ? 'real' : primaryReadable ? 'partial' : 'unavailable',
    error: primaryError,
    requestedReference: reference ?? null,
    resourcesDiscovered,
    resourcesAttempted: resourceResults.length,
    rowsScanned,
    recordsMatched,
    archiveEntries,
    recordTypes,
    resources: resourceResults,
  },
  fallback: fallback ? {
    source: 'BrasilAPI CNPJ v1',
    sourceAuthority: fallback.sourceAuthority,
    sourceConfidence: fallback.sourceConfidence,
    status: fallback.status,
    endpoint: fallback.endpoint,
    recordsMatched: fallback.records.length,
    recordTypes: fallbackRecordTypes,
    error: fallback.error ?? null,
    activatedReason: primaryError ?? (primaryMatched ? null : 'official_bulk_returned_no_match'),
  } : null,
  requested: {
    reference: reference ?? null,
    maxResources,
    maxMatchedRows,
    requireMatch,
    scanAll,
    fallbackAllowed: !disableFallback,
  },
  persisted: false,
  privacy: 'No partner name, document, representative document or raw QSA row is printed or persisted by this probe.',
  governance: {
    officialBulkHealth: primarySucceeded ? 'healthy' : 'degraded',
    fallbackNeverPromotesOfficialHealth: true,
    fallbackConfidenceLowerThanOfficial: true,
  },
};

console.log(JSON.stringify(result, null, 2));
if (status !== 'real') process.exitCode = 1;
