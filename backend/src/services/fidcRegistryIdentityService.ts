import { fetchBrasilApiCompany, fetchMinhaReceitaCompany } from '../lib/connectors.js';
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
type RegistryResult = Awaited<ReturnType<FetchRegistry | FetchFallback>>;
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
  const registryCnpj = normalizeCnpj(data.cnpj);
  const normalizedInput = normalizeCnpj(cnpj);
  const legalName = clean(data.razao_social ?? data.nome_empresarial);
  if (
    !isValidCnpj(normalizedInput)
    || registryCnpj !== normalizedInput
    || legalName.length < 3
    || ![
      'https://brasilapi.com.br/api/cnpj/v1/' + normalizedInput,
      'https://minhareceita.org/' + normalizedInput,
    ].includes(response.endpoint)
  ) return null;
  return {
    cnpj: normalizedInput,
    legal_name: legalName,
    trade_name: clean(data.nome_fantasia) || null,
    registration_status: clean(data.descricao_situacao_cadastral) || null,
    municipality: clean(data.municipio) || null,
    state_code: clean(data.uf) || null,
    registry_provider: response.endpoint.startsWith('https://minhareceita.org/')
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
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(deps: Dependencies = {}) {
    this.client = deps.client === undefined ? getDataClient() : deps.client;
    this.fetchRegistry = deps.fetchRegistry ?? fetchBrasilApiCompany;
    this.fetchFallback = deps.fetchFallback ?? fetchMinhaReceitaCompany;
    this.now = deps.now ?? (() => new Date());
    this.sleep = deps.sleep ?? sleep;
  }

  async run({ limit = 10 }: { limit?: number } = {}): Promise<FIDCRegistryIdentityResult> {
    if (!this.client) throw new Error('Neon runtime is required to enrich FIDC identities.');
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PER_RUN) {
      throw new Error(`limit must be an integer from 1 to ${MAX_PER_RUN}`);
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
      targets.push(cnpj);
      if (targets.length === limit) break;
    }
    let registryMatched = 0, invalidRegistry = 0, unavailable = 0, stored = 0;
    for (let i = 0; i < targets.length; i += 1) {
      if (i) await this.sleep(API_PAUSE_MS);
      const cnpj = targets[i];
      try {
        const primary = await this.fetchRegistry(cnpj);
        const result: RegistryResult = primary.status === 'real' ? primary : await this.fetchFallback(cnpj);
        if (result.status !== 'real') {
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
      } catch {
        unavailable += 1; // no false company name, no automatic candidate
      }
    }
    return {
      status: targets.length ? 'completed' : 'no_targets',
      selected: targets.length, registryMatched, invalidRegistry,
      unavailable, stored, skippedCached, reviewRequired: true,
    };
  }
}
