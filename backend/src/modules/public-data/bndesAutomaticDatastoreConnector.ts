import { createHash } from 'node:crypto';
import type { PublicBulkResource } from './publicBulkDatasetConnector.js';

const BNDES_RESOURCE_ID = '612faa0b-b6be-4b2c-9317-da5dc2c0b901';
const BNDES_RESOURCE_URL = 'https://dadosabertos.bndes.gov.br/dataset/10e21ad1-568e-45e5-a8af-43f2c05ef1a2/resource/612faa0b-b6be-4b2c-9317-da5dc2c0b901/download/operacoes-financiamento-operacoes-indiretas-automaticas.csv';
const BNDES_RESOURCE_SHOW_URL = `https://dadosabertos.bndes.gov.br/api/3/action/resource_show?id=${BNDES_RESOURCE_ID}`;
const BNDES_DATASTORE_URL = 'https://dadosabertos.bndes.gov.br/api/3/action/datastore_search';
const USER_AGENT = 'OriginationIntelligencePlatform/1.0';

const clean = (value: unknown) => String(value ?? '').trim();
const digits = (value: unknown) => clean(value).replace(/\D/g, '');
const sha256 = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const isoDate = (value: unknown) => {
  const match = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};
const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export type BndesAutomaticResource = PublicBulkResource & {
  resourceId: string;
  resourceHash: string;
  sizeBytes: number | null;
  datastoreActive: boolean;
  metadataSource: 'resource_show' | 'fallback';
};

export type BndesDatastorePage = {
  records: Array<Record<string, unknown>>;
  total: number;
  offset: number;
  limit: number;
};

type CkanEnvelope<T> = {
  success?: boolean;
  result?: T;
  error?: { message?: string };
};

const fetchJsonWithRetry = async <T>(
  url: string,
  init: RequestInit,
  label: string,
  attempts = 3,
): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`${label} failed: HTTP ${response.status}`);
      return await response.json() as T;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(Math.min(750 * (2 ** (attempt - 1)), 4_000));
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
};

export const formatCnpj = (value: string) => {
  const normalized = digits(value);
  if (normalized.length !== 14) return normalized;
  return `${normalized.slice(0, 2)}.${normalized.slice(2, 5)}.${normalized.slice(5, 8)}/${normalized.slice(8, 12)}-${normalized.slice(12)}`;
};

export const buildCnpjFilterValues = (cnpjs: string[]) => [...new Set(cnpjs.flatMap((cnpj) => {
  const normalized = digits(cnpj);
  if (normalized.length !== 14) return [];
  return [normalized, formatCnpj(normalized)];
}))];

export const fingerprintBndesTargetUniverse = (resourceHash: string, cnpjs: string[]) => sha256({
  resourceHash,
  cnpjs: [...new Set(cnpjs.map(digits).filter((cnpj) => cnpj.length === 14))].sort(),
});

export const discoverBndesAutomaticResource = async (): Promise<BndesAutomaticResource> => {
  try {
    const payload = await fetchJsonWithRetry<CkanEnvelope<Record<string, unknown>>>(
      BNDES_RESOURCE_SHOW_URL,
      { method: 'GET' },
      'BNDES resource discovery',
    );
    if (!payload.success || !payload.result) throw new Error(payload.error?.message ?? 'CKAN resource_show returned no resource.');
    const result = payload.result;
    const resourceHash = clean(result.hash) || sha256({
      url: result.url,
      lastModified: result.last_modified,
      size: result.size,
    });
    return {
      resourceId: clean(result.id) || BNDES_RESOURCE_ID,
      resourceHash,
      sizeBytes: Number.isFinite(Number(result.size)) ? Number(result.size) : null,
      datastoreActive: Boolean(result.datastore_active),
      metadataSource: 'resource_show',
      key: `bndes-automatic:${clean(result.id) || BNDES_RESOURCE_ID}:${resourceHash}`,
      name: clean(result.name) || 'Operações indiretas automáticas',
      url: clean(result.url) || BNDES_RESOURCE_URL,
      format: 'csv',
      encoding: 'windows-1252',
      delimiter: ';',
      referenceDate: isoDate(result.last_modified),
      modifiedAt: clean(result.last_modified) || null,
      etag: resourceHash,
    };
  } catch {
    const resourceHash = 'fallback-resource-metadata';
    return {
      resourceId: BNDES_RESOURCE_ID,
      resourceHash,
      sizeBytes: 1_192_933_510,
      datastoreActive: true,
      metadataSource: 'fallback',
      key: `bndes-automatic:${BNDES_RESOURCE_ID}:${resourceHash}`,
      name: 'Operações indiretas automáticas',
      url: BNDES_RESOURCE_URL,
      format: 'csv',
      encoding: 'windows-1252',
      delimiter: ';',
      referenceDate: null,
      modifiedAt: null,
      etag: resourceHash,
    };
  }
};

export const fetchBndesAutomaticPage = async (input: {
  resourceId: string;
  cnpjFilters: string[];
  offset: number;
  limit: number;
}): Promise<BndesDatastorePage> => {
  const payload = await fetchJsonWithRetry<CkanEnvelope<{
    records?: Array<Record<string, unknown>>;
    total?: number;
  }>>(BNDES_DATASTORE_URL, {
    method: 'POST',
    body: JSON.stringify({
      resource_id: input.resourceId,
      filters: { cpf_cnpj: input.cnpjFilters },
      offset: input.offset,
      limit: input.limit,
      sort: '_id asc',
      include_total: true,
    }),
  }, 'BNDES datastore query');

  if (!payload.success || !payload.result) {
    throw new Error(payload.error?.message ?? 'BNDES datastore returned an unsuccessful response.');
  }
  const records = payload.result.records ?? [];
  return {
    records,
    total: Number(payload.result.total ?? records.length),
    offset: input.offset,
    limit: input.limit,
  };
};
