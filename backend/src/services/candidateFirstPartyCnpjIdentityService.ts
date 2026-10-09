import { createHash } from 'node:crypto';
import { fetchBrasilApiCompany } from '../lib/connectors.js';
import { getDataClient } from '../lib/dataClient.js';
import { isValidCnpj, normalizeCnpj } from './strategicPublicIngestionService.js';

const COMPANY_WEBSITE_SOURCE = 'src_company_website';
const BRASILAPI_SOURCE = 'src_brasilapi_cnpj';
const FIRST_PARTY_DATASET = 'company_website_cnpj_identity_candidates';
const BRASILAPI_DATASET = 'brasilapi_cnpj_candidates';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const FETCH_TIMEOUT_MS = 7_000;
const MAX_HTML_BYTES = 1_500_000;
const MAX_PAGES_PER_CANDIDATE = 8;

const COMMON_LEGAL_PATHS = [
  '/',
  '/termos',
  '/termos-de-uso',
  '/terms',
  '/privacy',
  '/privacy-policy',
  '/politica-de-privacidade',
  '/politica-de-privacidade/',
  '/legal',
  '/juridico',
  '/juridico/',
  '/sobre',
  '/about',
];

const LEGAL_LINK_PATTERN = /(privacidade|privacy|termos|terms|legal|jurid|sobre|about|institucional|compliance)/i;
const CNPJ_PATTERN = /(?:\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-.\s]?\d{2}\b|\b\d{14}\b)/g;

const asRecord = (value: unknown): Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const text = (...values: unknown[]) => String(
  values.find((value) => typeof value === 'string' && value.trim()) ?? '',
).trim();

const normalizeText = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeDomain = (value: unknown) => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  try {
    return new URL(raw.startsWith('http') ? raw : `https://${raw}`).hostname.replace(/^www\./, '').replace(/\.$/, '');
  } catch {
    return raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]?.replace(/\.$/, '') ?? '';
  }
};

const sha256 = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const sameDomain = (candidateDomain: string, url: URL) => {
  const hostname = url.hostname.replace(/^www\./, '').toLowerCase();
  return hostname === candidateDomain || hostname.endsWith(`.${candidateDomain}`);
};

const pageCandidates = (baseUrl: string, html: string) => {
  const base = new URL(baseUrl);
  const domain = normalizeDomain(base.hostname);
  const urls = new Set<string>(COMMON_LEGAL_PATHS.map((path) => new URL(path, base.origin).toString()));

  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi)) {
    const href = match[1]?.trim();
    if (!href || !LEGAL_LINK_PATTERN.test(href)) continue;
    try {
      const url = new URL(href, base);
      if (sameDomain(domain, url)) urls.add(url.toString());
    } catch {
      // Ignore malformed links from untrusted HTML.
    }
  }

  return [...urls].slice(0, MAX_PAGES_PER_CANDIDATE);
};

export const extractValidCnpjs = (html: string) => {
  const matches = html.replace(/&nbsp;/gi, ' ').match(CNPJ_PATTERN) ?? [];
  const valid = matches
    .map(normalizeCnpj)
    .filter((value) => value.length === 14 && isValidCnpj(value));
  return [...new Set(valid)];
};

const brandTokens = (...values: unknown[]) => [...new Set(
  values
    .flatMap((value) => normalizeText(value).split(' '))
    .filter((token) => token.length >= 3)
    .filter((token) => !['ltda', 'limitada', 'sa', 'sociedade', 'anonima', 'brasil', 'holding', 'grupo', 'participacoes', 'servicos', 'tecnologia'].includes(token)),
)];

export const scoreRegistryIdentity = (
  candidate: { companyName: string; legalName?: string | null },
  registry: Record<string, unknown>,
) => {
  const tokens = brandTokens(candidate.companyName, candidate.legalName);
  const legalName = text(registry.razao_social, registry.nome_empresarial, registry.legal_name);
  const tradeName = text(registry.nome_fantasia, registry.trade_name);
  const registryText = normalizeText(`${legalName} ${tradeName}`);
  const matchedTokens = tokens.filter((token) => registryText.includes(token));
  const normalizedCandidate = normalizeText(candidate.companyName);
  const normalizedTrade = normalizeText(tradeName);
  const normalizedLegal = normalizeText(legalName);

  const exactTrade = Boolean(normalizedTrade && normalizedCandidate && (normalizedTrade === normalizedCandidate || normalizedTrade.includes(normalizedCandidate)));
  const exactLegal = Boolean(normalizedLegal && normalizedCandidate && normalizedLegal.includes(normalizedCandidate));
  const coverage = tokens.length ? matchedTokens.length / tokens.length : 0;

  let confidence = 0;
  if (exactTrade) confidence = 0.99;
  else if (exactLegal) confidence = 0.97;
  else if (coverage >= 0.75 && matchedTokens.length >= 1) confidence = 0.95;
  else if (coverage >= 0.5 && matchedTokens.length >= 1) confidence = 0.90;

  return { confidence, matchedTokens, legalName, tradeName };
};

type CandidateRow = {
  id: string;
  company_name: string;
  legal_name: string | null;
  cnpj: string | null;
  website: string | null;
  normalized_domain: string | null;
  candidate_status: string | null;
  candidate_role: string | null;
  queue_type: string | null;
  canonical_rank: number | null;
  identity_review_status: string | null;
  promotion_ready: boolean | null;
  raw_payload: Record<string, unknown> | null;
};

type SourceRow = { id: string; metadata?: Record<string, unknown> | null };
type DataClient = NonNullable<ReturnType<typeof getDataClient>>;

type Dependencies = {
  client?: DataClient | null;
  fetchImpl?: typeof fetch;
  fetchRegistry?: typeof fetchBrasilApiCompany;
  now?: () => Date;
};

export type CandidateFirstPartyCnpjIdentityResult = {
  status: 'completed' | 'no_targets';
  targets: number;
  candidatesProbed: number;
  pagesProbed: number;
  uniqueCnpjFound: number;
  matched: number;
  ambiguous: number;
  unresolved: number;
  officialEnrichmentsWritten: number;
  errors: number;
};

export class CandidateFirstPartyCnpjIdentityService {
  private readonly client: DataClient | null;
  private readonly fetchImpl: typeof fetch;
  private readonly fetchRegistry: typeof fetchBrasilApiCompany;
  private readonly now: () => Date;

  constructor(dependencies: Dependencies = {}) {
    this.client = dependencies.client === undefined ? getDataClient() : dependencies.client;
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
    this.fetchRegistry = dependencies.fetchRegistry ?? fetchBrasilApiCompany;
    this.now = dependencies.now ?? (() => new Date());
  }

  async run(input: { limit?: number } = {}): Promise<CandidateFirstPartyCnpjIdentityResult> {
    if (!this.client) throw new Error('Neon data client not configured for first-party CNPJ identity resolution.');
    const limit = Math.min(Math.max(Math.trunc(input.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);

    const rows = await this.client.select('candidate_decision_queue_v4', {
      select: 'id,company_name,legal_name,cnpj,website,normalized_domain,candidate_status,candidate_role,queue_type,canonical_rank,identity_review_status,promotion_ready,raw_payload',
      filters: [
        { column: 'canonical_rank', value: 1 },
        { column: 'queue_type', value: 'identity' },
      ],
      orderBy: { column: 'updated_at', ascending: false },
      limit: 250,
    }) as CandidateRow[];

    const targets = rows.filter((row) => {
      const raw = row.raw_payload ?? {};
      const domain = normalizeDomain(row.normalized_domain || row.website);
      const domainIdentity = asRecord(raw.domain_intelligence);
      const role = String(row.candidate_role ?? raw.candidate_role ?? '');
      return row.canonical_rank === 1
        && row.queue_type === 'identity'
        && row.candidate_status === 'captured'
        && ['operating_company', 'operating_issuer', 'portfolio_company'].includes(role)
        && row.identity_review_status !== 'approved'
        && row.promotion_ready !== true
        && normalizeCnpj(row.cnpj ?? '').length !== 14
        && Boolean(domain)
        && domainIdentity.status === 'verified'
        && Number(domainIdentity.confidence ?? 0) >= 0.90
        && asRecord(raw.first_party_cnpj_identity).status !== 'matched';
    }).slice(0, limit);

    if (!targets.length) {
      return {
        status: 'no_targets', targets: 0, candidatesProbed: 0, pagesProbed: 0,
        uniqueCnpjFound: 0, matched: 0, ambiguous: 0, unresolved: 0,
        officialEnrichmentsWritten: 0, errors: 0,
      };
    }

    const sources = await this.client.select('source_catalog', { select: 'id,metadata', limit: 500 }) as SourceRow[];
    const websiteSourceId = sources.find((row) => row.metadata?.code === COMPANY_WEBSITE_SOURCE)?.id ?? null;
    const brasilApiSourceId = sources.find((row) => row.metadata?.code === BRASILAPI_SOURCE)?.id ?? null;

    let candidatesProbed = 0;
    let pagesProbed = 0;
    let uniqueCnpjFound = 0;
    let matched = 0;
    let ambiguous = 0;
    let unresolved = 0;
    let officialEnrichmentsWritten = 0;
    let errors = 0;

    for (const candidate of targets) {
      candidatesProbed += 1;
      try {
        const domain = normalizeDomain(candidate.normalized_domain || candidate.website);
        const homeUrl = candidate.website
          ? new URL(candidate.website.startsWith('http') ? candidate.website : `https://${candidate.website}`).toString()
          : `https://${domain}/`;

        const observedPages: Array<{ url: string; cnpjs: string[]; htmlHash: string }> = [];
        const cnpjSources = new Map<string, Set<string>>();
        let discoveredUrls = [homeUrl];

        for (let index = 0; index < discoveredUrls.length && index < MAX_PAGES_PER_CANDIDATE; index += 1) {
          const url = discoveredUrls[index];
          try {
            const parsed = new URL(url);
            if (!sameDomain(domain, parsed)) continue;
            const response = await this.fetchImpl(url, {
              headers: {
                accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
                'user-agent': 'Motor-Origination-FirstParty-Identity/1.0',
              },
              redirect: 'follow',
              signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            });
            pagesProbed += 1;
            if (!response.ok || !String(response.headers.get('content-type') ?? '').toLowerCase().includes('text/html')) continue;
            const finalUrl = new URL(response.url || url);
            if (!sameDomain(domain, finalUrl)) continue;
            let html = await response.text();
            if (html.length > MAX_HTML_BYTES) html = html.slice(0, MAX_HTML_BYTES);
            if (index === 0) {
              const extra = pageCandidates(finalUrl.toString(), html);
              discoveredUrls = [...new Set([...discoveredUrls, ...extra])].slice(0, MAX_PAGES_PER_CANDIDATE);
            }
            const cnpjs = extractValidCnpjs(html);
            observedPages.push({ url: finalUrl.toString(), cnpjs, htmlHash: sha256(html) });
            for (const cnpj of cnpjs) {
              const urls = cnpjSources.get(cnpj) ?? new Set<string>();
              urls.add(finalUrl.toString());
              cnpjSources.set(cnpj, urls);
            }
          } catch {
            // Continue to other legal pages; failure is captured in the aggregate result.
          }
        }

        const cnpjs = [...cnpjSources.keys()];
        const observedAt = this.now().toISOString();
        const existingRaw = candidate.raw_payload ?? {};

        if (cnpjs.length !== 1) {
          if (cnpjs.length > 1) ambiguous += 1;
          else unresolved += 1;
          await this.client.update('discovered_company_candidates', {
            raw_payload: {
              ...existingRaw,
              first_party_cnpj_identity: {
                version: 1,
                status: cnpjs.length > 1 ? 'ambiguous' : 'unresolved',
                verifiedDomain: domain,
                candidateCnpjs: cnpjs,
                pages: observedPages,
                observedAt,
                humanApprovalRequired: true,
                automaticPromotion: false,
              },
            },
            updated_at: observedAt,
          }, [{ column: 'id', value: candidate.id }]);
          continue;
        }

        uniqueCnpjFound += 1;
        const [cnpj] = cnpjs;
        const registry = await this.fetchRegistry(cnpj);
        if (registry.status !== 'real') {
          unresolved += 1;
          await this.client.update('discovered_company_candidates', {
            raw_payload: {
              ...existingRaw,
              first_party_cnpj_identity: {
                version: 1,
                status: 'registry_unavailable',
                verifiedDomain: domain,
                cnpj,
                sourceUrls: [...(cnpjSources.get(cnpj) ?? [])],
                registryEndpoint: registry.endpoint,
                observedAt,
                humanApprovalRequired: true,
                automaticPromotion: false,
              },
            },
            updated_at: observedAt,
          }, [{ column: 'id', value: candidate.id }]);
          continue;
        }

        const registryData = asRecord(registry.data);
        const identity = scoreRegistryIdentity({
          companyName: candidate.company_name,
          legalName: candidate.legal_name,
        }, registryData);

        if (identity.confidence < 0.90 || !identity.legalName) {
          ambiguous += 1;
          await this.client.update('discovered_company_candidates', {
            raw_payload: {
              ...existingRaw,
              first_party_cnpj_identity: {
                version: 1,
                status: 'registry_name_mismatch',
                verifiedDomain: domain,
                cnpj,
                sourceUrls: [...(cnpjSources.get(cnpj) ?? [])],
                registryEndpoint: registry.endpoint,
                registryLegalName: identity.legalName,
                registryTradeName: identity.tradeName,
                confidence: identity.confidence,
                matchedTokens: identity.matchedTokens,
                observedAt,
                humanApprovalRequired: true,
                automaticPromotion: false,
              },
            },
            updated_at: observedAt,
          }, [{ column: 'id', value: candidate.id }]);
          continue;
        }

        const sourceUrl = [...(cnpjSources.get(cnpj) ?? [])][0] ?? homeUrl;
        const evidenceSummary = `O domínio oficial ${domain} publica o CNPJ ${cnpj}. A BrasilAPI confirma ${identity.legalName}${identity.tradeName ? ` (nome fantasia ${identity.tradeName})` : ''}. A combinação first-party + cadastro público atingiu confiança ${(identity.confidence * 100).toFixed(0)}% e permanece sujeita à aprovação humana.`;

        const firstPartyData = {
          cnpj,
          domain,
          sourceUrl,
          sourceUrls: [...(cnpjSources.get(cnpj) ?? [])],
          legalName: identity.legalName,
          tradeName: identity.tradeName,
          confidence: identity.confidence,
          matchedTokens: identity.matchedTokens,
          pages: observedPages,
          observedAt,
        };
        const registryNormalized = {
          cnpj,
          legalName: identity.legalName,
          tradeName: identity.tradeName,
          registrationStatus: text(registryData.descricao_situacao_cadastral, registryData.situacao_cadastral),
          city: text(registryData.municipio),
          state: text(registryData.uf),
          primaryActivity: text(registryData.cnae_fiscal_descricao),
          endpoint: registry.endpoint,
          observedAt,
        };

        await this.client.update('discovered_company_candidates', {
          legal_name: identity.legalName,
          cnpj,
          raw_payload: {
            ...existingRaw,
            identity_review_status: String(candidate.identity_review_status ?? existingRaw.identity_review_status ?? 'pending'),
            legal_name_verified: false,
            promotion_ready: false,
            identity_evidence_url: sourceUrl,
            review_legal_name: identity.legalName,
            review_cnpj: cnpj,
            review_website: candidate.website ?? `https://${domain}/`,
            review_confidence: identity.confidence,
            review_evidence_summary: evidenceSummary,
            first_party_cnpj_identity: {
              version: 1,
              status: 'matched',
              ...firstPartyData,
              registryEndpoint: registry.endpoint,
              registrySourceCode: BRASILAPI_SOURCE,
              humanApprovalRequired: true,
              automaticPromotion: false,
              automaticDecisionEligibility: false,
            },
          },
          updated_at: observedAt,
        }, [{ column: 'id', value: candidate.id }]);

        await this.client.upsert('candidate_official_enrichments', [{
          candidate_id: candidate.id,
          source_id: websiteSourceId,
          dataset_code: FIRST_PARTY_DATASET,
          source_record_key: `${candidate.id}:${cnpj}`,
          entity_cnpj: cnpj,
          enrichment_type: 'first_party_cnpj_identity',
          source_url: sourceUrl,
          content_hash: sha256(firstPartyData),
          data: firstPartyData,
          observed_at: observedAt,
        }, {
          candidate_id: candidate.id,
          source_id: brasilApiSourceId,
          dataset_code: BRASILAPI_DATASET,
          source_record_key: cnpj,
          entity_cnpj: cnpj,
          enrichment_type: 'cnpj_registry_corroboration',
          source_url: registry.endpoint,
          content_hash: sha256(registryNormalized),
          data: registryNormalized,
          observed_at: observedAt,
        }], 'candidate_id,dataset_code,source_record_key');

        matched += 1;
        officialEnrichmentsWritten += 2;
      } catch {
        errors += 1;
      }
    }

    return {
      status: 'completed',
      targets: targets.length,
      candidatesProbed,
      pagesProbed,
      uniqueCnpjFound,
      matched,
      ambiguous,
      unresolved,
      officialEnrichmentsWritten,
      errors,
    };
  }
}
