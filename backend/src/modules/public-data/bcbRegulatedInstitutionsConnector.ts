const BCB_ENTITIES_BASE_URL = 'https://olinda.bcb.gov.br/olinda/servico/BcBase/versao/v2/odata/EntidadesSupervisionadas(dataBase=@dataBase)';
const BCB_SEATS_BASE_URL = 'https://olinda.bcb.gov.br/olinda/servico/Instituicoes_em_funcionamento/versao/v1/odata/SedesSociedades';
const DEFAULT_PAGE_SIZE = 1000;
const MAX_ROWS = 10_000;
const DEFAULT_ATTEMPTS = 4;
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_REFERENCE_LOOKBACK_DAYS = 14;
const USER_AGENT = 'OriginationIntelligencePlatform/1.0';

export type BcbRegulatedInstitution = {
  cnpj: string;
  cnpjRoot: string;
  legalName: string;
  shortName: string | null;
  fantasyName: string | null;
  supervisedType: string | null;
  legalStatus: string | null;
  legalNature: string | null;
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
  now?: () => Date;
};

const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const digits = (value: unknown) => clean(value).replace(/\D/g, '');
const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
const retryable = (status: number) => status === 408 || status === 425 || status === 429 || status >= 500;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

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

const formatReferenceDate = (date: Date) => {
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${mm}-${dd}-${date.getUTCFullYear()}`;
};

const isoReferenceDate = (value: unknown) => {
  const raw = clean(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};

const fetchPayload = async (url: string, options: FetchOptions = {}): Promise<BcbPayload | null> => {
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
      if (response.status === 400 || response.status === 404) return null;
      lastError = new Error(`BCB institutions HTTP ${response.status}`);
      if (!retryable(response.status)) break;
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await sleepImpl(Math.min(500 * 2 ** (attempt - 1), 4_000));
  }
  throw new Error(`BCB regulated institutions request failed: ${errorMessage(lastError)}`);
};

const entityUrl = (referenceDate: string, skip: number) => {
  const url = new URL(BCB_ENTITIES_BASE_URL);
  url.searchParams.set('@dataBase', `'${referenceDate}'`);
  url.searchParams.set('$format', 'json');
  url.searchParams.set('$top', String(DEFAULT_PAGE_SIZE));
  url.searchParams.set('$skip', String(skip));
  return url.toString();
};

const seatsUrl = (skip: number) => {
  const url = new URL(BCB_SEATS_BASE_URL);
  url.searchParams.set('$format', 'json');
  url.searchParams.set('$top', String(DEFAULT_PAGE_SIZE));
  url.searchParams.set('$skip', String(skip));
  return url.toString();
};

const mapEntityRow = (row: RawBcbRow): BcbRegulatedInstitution | null => {
  const cnpj = digits(row.codigoCNPJ14);
  const cnpjRoot = digits(row.codigoCNPJ8).slice(0, 8) || cnpj.slice(0, 8);
  const legalName = clean(row.nomeEntidadeInteresse);
  if (cnpj.length !== 14 || cnpjRoot.length !== 8 || !legalName) return null;
  return {
    cnpj,
    cnpjRoot,
    legalName,
    shortName: clean(row.nomeReduzido) || null,
    fantasyName: clean(row.nomeFantasia) || null,
    supervisedType: clean(row.descricaoTipoEntidadeSupervisionada) || null,
    legalStatus: clean(row.descricaoTipoSituacaoPessoaJuridica) || null,
    legalNature: clean(row.descricaoNaturezaJuridica) || null,
    segment: null,
    address: null,
    complement: null,
    neighborhood: null,
    zipCode: null,
    city: clean(row.nomeDoMunicipio) || null,
    state: clean(row.nomeDaUnidadeFederativa) || null,
    areaCode: null,
    phone: null,
    email: null,
    website: null,
    municipalityIbge: clean(row.codigoDoMunicipioNoIBGE) || null,
  };
};

type SeatDetails = Pick<BcbRegulatedInstitution,
  'segment' | 'address' | 'complement' | 'neighborhood' | 'zipCode' | 'city' | 'state' |
  'areaCode' | 'phone' | 'email' | 'website' | 'municipalityIbge'>;

const mapSeatRow = (row: RawBcbRow): { cnpjRoot: string; details: SeatDetails } | null => {
  const cnpjRoot = digits(row.CNPJ).slice(0, 8);
  if (cnpjRoot.length !== 8) return null;
  return {
    cnpjRoot,
    details: {
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
    },
  };
};

const fetchLatestEntitySnapshot = async (options: FetchOptions) => {
  const now = options.now?.() ?? new Date();
  for (let daysAgo = 0; daysAgo <= MAX_REFERENCE_LOOKBACK_DAYS; daysAgo += 1) {
    const candidateDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo));
    const referenceParam = formatReferenceDate(candidateDate);
    const first = await fetchPayload(entityUrl(referenceParam, 0), options);
    if (!first?.value?.length) continue;

    const rawRows = [...first.value];
    let skip = DEFAULT_PAGE_SIZE;
    let pages = 1;
    while (rawRows.length < MAX_ROWS && rawRows.length === skip) {
      const payload = await fetchPayload(entityUrl(referenceParam, skip), options);
      const batch = payload?.value ?? [];
      rawRows.push(...batch);
      pages += 1;
      if (batch.length < DEFAULT_PAGE_SIZE) break;
      skip += DEFAULT_PAGE_SIZE;
    }
    return {
      referenceDate: isoReferenceDate(first.value[0]?.database) ?? candidateDate.toISOString().slice(0, 10),
      rows: rawRows.map(mapEntityRow).filter((row): row is BcbRegulatedInstitution => Boolean(row)).slice(0, MAX_ROWS),
      pages,
    };
  }
  throw new Error(`BCB BCBase returned no entity snapshot within ${MAX_REFERENCE_LOOKBACK_DAYS + 1} calendar days.`);
};

const fetchSeatDetails = async (options: FetchOptions) => {
  const byRoot = new Map<string, SeatDetails>();
  let skip = 0;
  let pages = 0;
  try {
    while (skip < MAX_ROWS) {
      const payload = await fetchPayload(seatsUrl(skip), options);
      const rawRows = payload?.value ?? [];
      for (const row of rawRows) {
        const mapped = mapSeatRow(row);
        if (mapped && !byRoot.has(mapped.cnpjRoot)) byRoot.set(mapped.cnpjRoot, mapped.details);
      }
      pages += 1;
      if (rawRows.length < DEFAULT_PAGE_SIZE) break;
      skip += DEFAULT_PAGE_SIZE;
    }
    return { byRoot, pages, status: 'available' as const, error: null };
  } catch (error) {
    return {
      byRoot,
      pages,
      status: 'degraded' as const,
      error: errorMessage(error),
    };
  }
};

export const fetchBcbRegulatedInstitutions = async (options: FetchOptions = {}) => {
  const [entities, seats] = await Promise.all([
    fetchLatestEntitySnapshot(options),
    fetchSeatDetails(options),
  ]);
  const rows = entities.rows.map((entity) => {
    const seat = seats.byRoot.get(entity.cnpjRoot);
    return seat ? { ...entity, ...seat } : entity;
  });
  return {
    sourceUrl: BCB_ENTITIES_BASE_URL,
    referenceDate: entities.referenceDate,
    rows,
    pages: entities.pages + seats.pages,
    seatEnrichment: {
      status: seats.status,
      rowsMatched: seats.byRoot.size,
      error: seats.error,
    },
  };
};
