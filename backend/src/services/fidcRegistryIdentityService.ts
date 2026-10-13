import { fetchBrasilApiCompany, fetchMinhaReceitaCompany, fetchCnpjWsPublicCompany } from '../lib/connectors.js';
import { getDataClient } from '../lib/dataClient.js';
import { isValidCnpj, normalizeCnpj } from './strategicPublicIngestionService.js';

// This service enriches a CVM-verified CNPJ, NOT an eligible credit lead.
// A registry name needs human review before candidate/company promotion.
const MAX_PER_RUN = 20;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const API_PAUSE_MS = 250;
type Client = NonNullable<ReturnType<typeof getDataClient>>;
type FetchRegistry = typeof fetchBrasilApiCompany;
type FetchFallback = typeof fetchMinhaReceitaCompany;
type FetchTertiary = typeof fetchCnpjWsPublicCompany;
type RegistryResult = Awaited<ReturnType<FetchRegistry | FetchFallback | FetchTertiary>>;
type QueueRow = {
  cnpj: string;
  evidence_links: number | string;
  identity_next_step: string;
  registry_legal_name: string | null;
  registry_checked_at: string | null;
};
type Dependencies = {
  client?: Client | null;
  fetchRegistry?: FetchRegistry;
  fetchFallback?: FetchFallback;
  fetchTertiary?: FetchTertiary;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
};
export type FIDCRegistryIdentityResult = {
  status: 'completed' | 'no_targets';
  selected: number;
  registryMatched: number;
  invalidRegistry: number;
  unavailable: number;
  stored: number;
  skippedCached: number;
  reviewRequired: boolean;
  unavailableByReason: Record<string, number>;
  offset: number;
};

const record = (value: unknown): Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
);
const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const normalizeFIDCRegistryIdentity = (
  cnpj: string,
  response: RegistryResult,
  verifiedAt: Date,
) => {
  if (response.status !== 'real') return null;
  const data = record(response.data);
  const fromCnpjWs = response.endpoint.startsWith('https://publica.cnpj.ws/cnpj/');
  const office = record(data.estabelecimento);
  // CNPJ.ws returns a root CNPJ at top level. Require full office CNPJ.
  const registryCnpj = normalizeCnpj(fromCnpjWs ? office.cnpj : data.cnpj);
  const normalizedInput = normalizeCnpj(cnpj);
  const legalName = clean(data.razao_social ?? data.nome_empresarial);
  if (
    !isValidCnpj(normalizedInput)
    || registryCnpj !== normalizedInput
    || legalName.length < 3
    || ![
      'https://brasilapi.com.br/api/cnpj/v1/' + normalizedInput,
      'https://minhareceita.org/' + normalizedInput,
      'https://publica.cnpj.ws/cnpj/' + normalizedInput,
    ].includes(response.endpoint)
  ) return null;
  return {
    cnpj: normalizedInput,
    legal_name: legalName,
    trade_name: clean(fromCnpjWs ? office.nome_fantasia : data.nome_fantasia) || null,
    registration_status: clean(fromCnpjWs ? office.situacao_cadastral : data.descricao_situacao_cadastral) || null,
    municipality: clean(fromCnpjWs ? record(office.cidade).nome : data.municipio) || null,
    state_code: clean(fromCnpjWs ? record(office.estado).sigla : data.uf) || null,
    registry_provider: fromCnpjWs ? 'cnpjws_publica_proxy'
      : response.endpoint.startsWith('https://minhareceita.org/')
        ? 'minhareceita_receita_proxy' : 'brasilapi_receita_proxy',
    registry_url: response.endpoint,
    registry_checked_at: verifiedAt.toISOString(),
    updated_at: verifiedAt.toISOString(),
  };
};

export class FIDCRegistryIdentityService {
  private readonly client: Client | null;
  private readonly fetchRegistry: FetchRegistry;
  private readonly fetchFallback: FetchFallback;
  private readonly fetchTertiary: FetchTertiary;
  private lastTertiaryRequestMs = -Infinity;
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(deps: Dependencies = {}) {
    this.client = deps.client === undefined ? getDataClient() : deps.client;
    this.fetchRegistry = deps.fetchRegistry ?? fetchBrasilApiCompany;
    this.fetchFallback = deps.fetchFallback ?? fetchMinhaReceitaCompany;
    this.fetchTertiary = deps.fetchTertiary ?? fetchCnpjWsPublicCompany;
    this.now = deps.now ?? (() => new Date());
    this.sleep = deps.sleep ?? sleep;
  }

  async run({ limit = 10, offset = 0 }: { limit?: number; offset?: number } = {}): Promise<FIDCRegistryIdentityResult> {
    if (!this.client) throw new Error('Neon runtime is required to enrich FIDC identities.');
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PER_RUN) {
      throw new Error(`limit must be an integer from 1 to ${MAX_PER_RUN}`);
    }
    if (!Number.isInteger(offset) || offset < 0 || offset > 200) {
      throw new Error('offset must be an integer from 0 to 200');
    }
    const queue = await this.client.select('fidc_assignor_identity_queue_v5', {
      select: 'cnpj,evidence_links,identity_next_step,registry_legal_name,registry_checked_at',
      orderBy: { column: 'cnpj', ascending: true },
      limit: 250,
    }) as QueueRow[];
    const unique = new Set<string>();
    let skippedCached = 0;
    const now = this.now();
    const targets: string[] = [];
    let unresolvedSeen = 0;
    for (const row of queue) {
      const cnpj = normalizeCnpj(row.cnpj);
      if (!isValidCnpj(cnpj) || unique.has(cnpj)) continue;
      unique.add(cnpj);
      if (row.identity_next_step !== 'needs_registry_identity') continue;
      const cachedAt = row.registry_checked_at ? Date.parse(row.registry_checked_at) : NaN;
      if (
        row.registry_legal_name
        && Number.isFinite(cachedAt)
        && cachedAt <= now.getTime()
        && now.getTime() - cachedAt < CACHE_TTL_MS
      ) {
        skippedCached += 1;
        continue;
      }
      if (unresolvedSeen < offset) { unresolvedSeen += 1; continue; }
      targets.push(cnpj);
      if (targets.length === limit) break;
    }
    let registryMatched = 0, invalidRegistry = 0, unavailable = 0, stored = 0;
    const unavailableByReason: Record<string, number> = {};
    const noteFailure = (error: unknown) => {
      const message = String(error ?? '').toLowerCase();
      const category = /\b429\b|rate.limit/.test(message) ? 'rate_limited'
        : /\b404\b|not.found/.test(message) ? 'not_found'
        : /\b403\b|forbidden/.test(message) ? 'access_denied'
        : /timeout|abort|timed.out/.test(message) ? 'timeout'
        : 'other';
      unavailableByReason[category] = (unavailableByReason[category] ?? 0) + 1;
    };
    for (let i = 0; i < targets.length; i += 1) {
      if (i) await this.sleep(API_PAUSE_MS);
      const cnpj = targets[i];
      try {
        const primary = await this.fetchRegistry(cnpj);
        const secondary: RegistryResult = primary.status === 'real' ? primary : await this.fetchFallback(cnpj);
        let result: RegistryResult = secondary;
        if (secondary.status !== 'real') {
          // CNPJ.ws Public API: <=3 requests/minute/IP; 21-second spacing
          // applies only to this tertiary provider, never the other sources.
          const remainingMs = 21_000 - (Date.now() - this.lastTertiaryRequestMs);
          if (remainingMs > 0) await this.sleep(remainingMs);
          this.lastTertiaryRequestMs = Date.now();
          result = await this.fetchTertiary(cnpj);
        }
        if (result.status !== 'real') {
          noteFailure(record(result.data).error); 
          unavailable += 1;
          continue;
        }
        const value = normalizeFIDCRegistryIdentity(cnpj, result, now);
        if (!value) {
          invalidRegistry += 1;
          continue;
        }
        registryMatched += 1;
        await this.client.upsert('fidc_assignor_registry_identities', [value], 'cnpj');
        stored += 1;
      } catch (error) {
        noteFailure(error);
        unavailable += 1; // no false company name, no automatic candidate
      }
    }
    return {
      status: targets.length ? 'completed' : 'no_targets',
      selected: targets.length, registryMatched, invalidRegistry,
      unavailable, stored, skippedCached, reviewRequired: true,
      unavailableByReason, offset,
    };
  }
}
