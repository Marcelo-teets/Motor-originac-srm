const BCB_BASE_URL = 'https://olinda.bcb.gov.br/olinda/servico/Instituicoes_em_funcionamento/versao/v1/odata/SedesSociedades';
const DEFAULT_PAGE_SIZE = 1000;
const MAX_ROWS = 10_000;
const DEFAULT_ATTEMPTS = 4;
const DEFAULT_TIMEOUT_MS = 20_000;
const USER_AGENT = 'OriginationIntelligencePlatform/1.0';

export type BcbRegulatedInstitution = {
  cnpjRoot: string;
  legalName: string;
  segment: string | null;
  address: string | null;
  complement: string | null;
  neighborhood: string | null;
  zipCode: string | null;
  city: string | null;
  state: string | null;
  areaCode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  municipalityIbge: string | null;
};

type RawBcbRow = Record<string, unknown>;
type BcbPayload = { value?: RawBcbRow[]; '@odata.nextLink'?: string };
type FetchOptions = {
  fetchImpl?: typeof fetch;
  sleepImpl?: (milliseconds: number) => Promise<void>;
  attempts?: number;
  timeoutMs?: number;
};

const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const digits = (value: unknown) => clean(value).replace(/\D/g, '');
const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
const retryable = (status: number) => status === 408 || status === 425 || status === 429 || status >= 500;

const normalizeWebsite = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.toString();
  } catch {
    return null;
  }
};

const mapRow = (row: RawBcbRow): BcbRegulatedInstitution | null => {
  const cnpjRoot = digits(row.CNPJ).slice(0, 8);
  const legalName = clean(row.NOME_INSTITUICAO);
  if (cnpjRoot.length !== 8 || !legalName) return null;
  return {
    cnpjRoot,
    legalName,
    segment: clean(row.SEGMENTO) || null,
    address: clean(row.ENDERECO) || null,
    complement: clean(row.COMPLEMENTO) || null,
    neighborhood: clean(row.BAIRRO) || null,
    zipCode: clean(row.CEP) || null,
    city: clean(row.MUNICIPIO) || null,
    state: clean(row.UF) || null,
    areaCode: clean(row.DDD) || null,
    phone: clean(row.TELEFONE) || null,
    email: clean(row.E_MAIL) || null,
    website: normalizeWebsite(row.SITIO_NA_INTERNET),
    municipalityIbge: clean(row.MUNICIPIO_IBGE) || null,
  };
};

const fetchJsonWithRetry = async (url: string, options: FetchOptions = {}): Promise<BcbPayload> => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? sleep;
  const attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS);
  const timeoutMs = Math.max(1_000, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) return response.json() as Promise<BcbPayload>;
      lastError = new Error(`BCB institutions HTTP ${response.status}`);
      if (!retryable(response.status)) break;
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await sleepImpl(Math.min(500 * 2 ** (attempt - 1), 4_000));
  }
  throw new Error(`BCB regulated institutions request failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
};

export const fetchBcbRegulatedInstitutions = async (options: FetchOptions = {}) => {
  const rows: BcbRegulatedInstitution[] = [];
  let skip = 0;
  let pages = 0;

  while (rows.length < MAX_ROWS) {
    const url = new URL(BCB_BASE_URL);
    url.searchParams.set('$format', 'json');
    url.searchParams.set('$top', String(DEFAULT_PAGE_SIZE));
    url.searchParams.set('$skip', String(skip));
    const payload = await fetchJsonWithRetry(url.toString(), options);
    const batch = (payload.value ?? []).map(mapRow).filter((row): row is BcbRegulatedInstitution => Boolean(row));
    rows.push(...batch);
    pages += 1;
    if ((payload.value ?? []).length < DEFAULT_PAGE_SIZE) break;
    skip += DEFAULT_PAGE_SIZE;
  }

  return {
    sourceUrl: BCB_BASE_URL,
    rows: rows.slice(0, MAX_ROWS),
    pages,
  };
};
