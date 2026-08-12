import { createHash } from 'node:crypto';
import { parseDelimitedText } from './publicBulkDatasetConnector.js';

const RESOURCE_URL = 'https://dados.cvm.gov.br/dados/CIA_ABERTA/CAD/DADOS/cad_cia_aberta.csv';
const DATASET_URL = 'https://dados.cvm.gov.br/dataset/cia_aberta-cad';
const USER_AGENT = 'OriginationIntelligencePlatform/1.0';
const DEFAULT_FETCH_ATTEMPTS = 5;
const DEFAULT_FETCH_TIMEOUT_MS = 30_000;
const DEFAULT_FETCH_BASE_DELAY_MS = 1_000;
const MAX_FETCH_DELAY_MS = 8_000;
const RETRYABLE_STATUS = new Set([408, 425, 429]);

export type CvmOpenCompanyRegistryResource = {
  key: string;
  name: string;
  url: string;
  datasetUrl: string;
  modifiedAt: string | null;
  etag: string | null;
};

export type CvmOpenCompanyRegistryRecord = {
  recordKey: string;
  cnpj: string;
  companyName: string | null;
  tradeName: string | null;
  cvmCode: string | null;
  registrationDate: string | null;
  cancellationDate: string | null;
  registrationSituation: string | null;
  issuerSituation: string | null;
  registrationCategory: string | null;
  activitySector: string | null;
  marketType: string | null;
  effectiveDate: string | null;
  sourceUrl: string;
  contentHash: string;
  rawPayload: Record<string, string>;
};

export type CvmOpenCompanyRegistryStats = {
  rowsScanned: number;
  recordsMatched: number;
};

type FetchRetryOptions = {
  attempts?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
  fetchImpl?: typeof fetch;
  sleepImpl?: (milliseconds: number) => Promise<void>;
};

const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const digits = (value: unknown) => clean(value).replace(/\D/g, '');
const normalizeHeader = (value: string) => value
  .replace(/^\uFEFF/, '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');
const pick = (row: Record<string, string>, aliases: string[]) => {
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)];
    if (value !== undefined && clean(value)) return clean(value);
  }
  return '';
};
const parseDate = (value: unknown) => {
  const text = clean(value);
  const br = text.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
};
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const describeError = (error: unknown) => {
  if (!(error instanceof Error)) return String(error);
  const parts = [error.message];
  let cause = error.cause;
  const seen = new Set<unknown>();
  while (cause && !seen.has(cause)) {
    seen.add(cause);
    if (cause instanceof Error) {
      const code = 'code' in cause && typeof cause.code === 'string' ? ` [${cause.code}]` : '';
      parts.push(`${cause.message}${code}`);
      cause = cause.cause;
    } else {
      parts.push(String(cause));
      break;
    }
  }
  return [...new Set(parts.filter(Boolean))].join(' <- ');
};

const retryAfterMs = (response: Response) => {
  const raw = response.headers.get('retry-after');
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, MAX_FETCH_DELAY_MS);
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return null;
  return Math.min(Math.max(timestamp - Date.now(), 0), MAX_FETCH_DELAY_MS);
};

const isRetryableResponse = (response: Response) => (
  RETRYABLE_STATUS.has(response.status) || response.status >= 500
);

export const fetchCvmRegistryWithRetry = async (
  url: string,
  init: RequestInit = {},
  options: FetchRetryOptions = {},
) => {
  const attempts = Math.max(1, options.attempts ?? DEFAULT_FETCH_ATTEMPTS);
  const timeoutMs = Math.max(1_000, options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? DEFAULT_FETCH_BASE_DELAY_MS);
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? sleep;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        ...init,
        redirect: 'follow',
        headers: { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) },
        signal: init.signal ?? AbortSignal.timeout(timeoutMs),
      });
      if (response.ok || !isRetryableResponse(response)) return response;

      lastError = new Error(`HTTP ${response.status} ${response.statusText || 'transient response'}`);
      const delay = retryAfterMs(response)
        ?? Math.min(baseDelayMs * (2 ** (attempt - 1)), MAX_FETCH_DELAY_MS);
      await response.body?.cancel().catch(() => undefined);
      if (attempt < attempts && delay > 0) await sleepImpl(delay);
      continue;
    } catch (error) {
      lastError = error;
    }

    if (attempt < attempts) {
      const delay = Math.min(baseDelayMs * (2 ** (attempt - 1)), MAX_FETCH_DELAY_MS);
      if (delay > 0) await sleepImpl(delay);
    }
  }

  throw new Error(
    `CVM registry request failed after ${attempts} attempts: ${describeError(lastError)}`,
    { cause: lastError instanceof Error ? lastError : undefined },
  );
};

async function* decodeResponse(response: Response) {
  if (!response.body) throw new Error('CVM registry response did not include a body.');
  const decoder = new TextDecoder('windows-1252');
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield decoder.decode(value, { stream: true });
  }
  const tail = decoder.decode();
  if (tail) yield tail;
}

const rowObject = (headers: string[], values: string[]) => Object.fromEntries(
  headers.map((header, index) => [normalizeHeader(header), clean(values[index] ?? '')]),
);

export async function discoverCvmOpenCompanyRegistry(): Promise<CvmOpenCompanyRegistryResource> {
  const response = await fetchCvmRegistryWithRetry(
    RESOURCE_URL,
    { method: 'HEAD' },
    { attempts: 3, timeoutMs: 15_000 },
  ).catch(() => null);
  return {
    key: 'cvm-open-company-registry-current',
    name: 'CVM Cadastro de Companhias Abertas',
    url: RESOURCE_URL,
    datasetUrl: DATASET_URL,
    modifiedAt: response?.headers.get('last-modified') ?? null,
    etag: response?.headers.get('etag') ?? null,
  };
}

export async function streamCvmOpenCompanyRegistry(input: {
  resource: CvmOpenCompanyRegistryResource;
  targetCnpjs: Set<string>;
  onRecord: (record: CvmOpenCompanyRegistryRecord) => Promise<void>;
}): Promise<CvmOpenCompanyRegistryStats> {
  const response = await fetchCvmRegistryWithRetry(input.resource.url);
  if (!response.ok) throw new Error(`CVM registry download failed: ${response.status}`);
  let headers: string[] | null = null;
  let rowsScanned = 0;
  let recordsMatched = 0;

  for await (const values of parseDelimitedText(decodeResponse(response), ';')) {
    if (!headers) {
      headers = values.map(normalizeHeader);
      continue;
    }
    rowsScanned += 1;
    const rawPayload = rowObject(headers, values);
    const cnpj = digits(pick(rawPayload, ['CNPJ_CIA', 'CNPJ']));
    if (cnpj.length !== 14 || !input.targetCnpjs.has(cnpj)) continue;

    const cvmCode = pick(rawPayload, ['CD_CVM', 'COD_CVM']) || null;
    const registrationDate = parseDate(pick(rawPayload, ['DT_REG', 'DATA_REGISTRO']));
    const cancellationDate = parseDate(pick(rawPayload, ['DT_CANCEL', 'DATA_CANCELAMENTO']));
    const effectiveDate = parseDate(pick(rawPayload, ['DT_INI_SIT_EMISSOR', 'DT_INI_SIT', 'DT_REG']))
      ?? registrationDate;
    const normalized = {
      cnpj,
      companyName: pick(rawPayload, ['DENOM_SOCIAL', 'NOME_EMPRESARIAL']) || null,
      tradeName: pick(rawPayload, ['DENOM_COMERC', 'NOME_COMERCIAL']) || null,
      cvmCode,
      registrationDate,
      cancellationDate,
      registrationSituation: pick(rawPayload, ['SIT', 'SITUACAO_REGISTRO']) || null,
      issuerSituation: pick(rawPayload, ['SIT_EMISSOR', 'SITUACAO_EMISSOR']) || null,
      registrationCategory: pick(rawPayload, ['CATEG_REG', 'CATEGORIA_REGISTRO']) || null,
      activitySector: pick(rawPayload, ['SETOR_ATIV', 'SETOR_ATIVIDADE']) || null,
      marketType: pick(rawPayload, ['TP_MERC', 'TIPO_MERCADO']) || null,
      effectiveDate,
    };
    const recordKey = hash({ cnpj, cvmCode: normalized.cvmCode });
    await input.onRecord({
      recordKey,
      ...normalized,
      sourceUrl: input.resource.datasetUrl,
      contentHash: hash({ rawPayload, normalized }),
      rawPayload,
    });
    recordsMatched += 1;
  }

  return { rowsScanned, recordsMatched };
}
