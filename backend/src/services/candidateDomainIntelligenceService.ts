import { isIP } from 'node:net';
import { getSupabaseClient } from '../lib/supabase.js';
import {
  extractCandidateDomains,
  isWebsiteIdentityRetryDue,
  scoreWebsiteIdentity,
  significantNameTokens,
  websiteIdentityRetryAt,
  type WebsiteIdentityScore,
} from './candidateWebsiteIdentityService.js';

const VERSION = 'domain_intelligence_v1';
const SOURCE_CODE = 'src_company_website';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_QUERY_LIMIT = 300;
const PROBE_TIMEOUT_MS = 5_000;
const CONCURRENCY = 5;
const MAX_DOMAINS_PER_CANDIDATE = 8;
const MAX_HTML_CHARS = 1_500_000;

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'live.com',
  'yahoo.com', 'yahoo.com.br', 'icloud.com', 'me.com', 'uol.com.br',
  'bol.com.br', 'terra.com.br', 'proton.me', 'protonmail.com',
]);

const BLOCKED_DOMAIN_SUFFIXES = [
  'gov.br', 'cvm.gov.br', 'bcb.gov.br', 'google.com', 'google.com.br',
  'googleusercontent.com', 'github.com', 'linkedin.com', 'facebook.com',
  'instagram.com', 'youtube.com', 'youtu.be', 'x.com', 'twitter.com',
  'tiktok.com', 'wikipedia.org', 'medium.com', 'substack.com',
];

const GENERIC_BRAND_LABELS = new Set([
  'banco', 'bank', 'brasil', 'credito', 'credit', 'financeira', 'financeiro',
  'grupo', 'group', 'holding', 'servicos', 'service', 'services', 'companhia',
  'empresa', 'tecnologia', 'technology', 'digital',
]);

export type DomainHintStrategy = 'official_email' | 'observed_url' | 'name_guess';
export type CandidateDomainHint = { domain: string; strategy: DomainHintStrategy };
export type CandidateDomainIntelligenceOptions = {
  limit?: number;
  force?: boolean;
  tiers?: string[];
  candidateIds?: string[];
};
export type CandidateDomainIntelligenceResult = {
  status: 'completed' | 'no_targets';
  scanned: number;
  targetCount: number;
  skippedCooldown: number;
  candidatesWithObservedHints: number;
  generatedDomainGuesses: number;
  domainsProbed: number;
  websitesVerified: number;
  candidatesUpdated: number;
  unresolved: number;
  errors: number;
};

type CandidateQueueRow = {
  id: string;
  company_name: string | null;
  legal_name: string | null;
  cnpj: string | null;
  website: string | null;
  normalized_domain: string | null;
  candidate_status: string | null;
  priority_tier: string | null;
  source_url?: string | null;
  evidence_summary?: string | null;
  raw_payload?: Record<string, unknown> | null;
};
type OfficialEnrichmentRow = {
  candidate_id: string;
  dataset_code?: string | null;
  source_url?: string | null;
  data?: Record<string, unknown> | null;
  observed_at?: string | null;
};
type SupabaseClient = NonNullable<ReturnType<typeof getSupabaseClient>>;
type Dependencies = { client?: SupabaseClient | null; fetchImpl?: typeof fetch; now?: () => Date };
type ProbeMatch = {
  verified: boolean;
  probes: number;
  domain: string | null;
  website: string | null;
  score: WebsiteIdentityScore | null;
  strategy: DomainHintStrategy | null;
  bestConfidence: number;
};

const asRecord = (value: unknown): Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);
const normalizeText = (value: unknown) => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export const normalizeDomainCandidate = (value: unknown) => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./, '').replace(/\.$/, '');
  } catch {
    return raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]?.replace(/\.$/, '') ?? '';
  }
};

const isBlockedDomain = (value: string) => {
  const domain = normalizeDomainCandidate(value);
  if (!domain || FREE_EMAIL_DOMAINS.has(domain)) return true;
  return BLOCKED_DOMAIN_SUFFIXES.some((suffix) => domain === suffix || domain.endsWith(`.${suffix}`));
};

export const isSafePublicDomain = (value: unknown) => {
  const domain = normalizeDomainCandidate(value);
  if (!domain || domain.length > 253 || !domain.includes('.')) return false;
  if (domain === 'localhost' || domain.endsWith('.local') || isIP(domain) !== 0) return false;
  if (!/^[a-z0-9.-]+$/i.test(domain) || domain.includes('..')) return false;
  return !isBlockedDomain(domain);
};

const hostFromUrl = (value: string) => {
  try { return normalizeDomainCandidate(new URL(value).hostname); } catch { return ''; }
};

const domainsFromSerializedValue = (value: unknown) => {
  let serialized = '';
  try { serialized = typeof value === 'string' ? value : JSON.stringify(value ?? {}); } catch { return [] as string[]; }
  const urls = [...serialized.matchAll(/https?:\/\/[^\s"'<>\\]+/gi)].map((match) => hostFromUrl(match[0] ?? ''));
  const emails = [...serialized.matchAll(/@[a-z0-9.-]+\.[a-z]{2,}/gi)]
    .map((match) => normalizeDomainCandidate((match[0] ?? '').slice(1)));
  return [...new Set([...urls, ...emails])].filter(isSafePublicDomain);
};

export const extractObservedDomainHints = (
  candidate: Pick<CandidateQueueRow, 'raw_payload' | 'source_url' | 'evidence_summary'>,
  enrichments: OfficialEnrichmentRow[],
): CandidateDomainHint[] => {
  const emailHints = enrichments.flatMap((row) => extractCandidateDomains(row.data));
  const genericHints = [
    ...domainsFromSerializedValue(candidate.raw_payload),
    ...domainsFromSerializedValue(candidate.source_url),
    ...domainsFromSerializedValue(candidate.evidence_summary),
    ...enrichments.flatMap((row) => domainsFromSerializedValue(row.data)),
  ];
  const ordered: CandidateDomainHint[] = [
    ...emailHints.filter(isSafePublicDomain).map((domain) => ({ domain, strategy: 'official_email' as const })),
    ...genericHints.map((domain) => ({ domain, strategy: 'observed_url' as const })),
  ];
  const seen = new Set<string>();
  return ordered.flatMap((hint) => {
    const domain = normalizeDomainCandidate(hint.domain);
    if (!domain || seen.has(domain)) return [];
    seen.add(domain);
    return [{ ...hint, domain }];
  });
};

const brandLabels = (companyName: unknown, legalName: unknown) => {
  const tokens = significantNameTokens(companyName, legalName)
    .map((token) => normalizeText(token).replace(/[^a-z0-9]/g, ''))
    .filter((token) => token.length >= 3);
  if (!tokens.length) return [];
  const labels = [tokens.slice(0, 2).join(''), tokens[0], tokens.length >= 3 ? tokens.slice(0, 3).join('') : '']
    .filter((label) => label.length >= 4 && !GENERIC_BRAND_LABELS.has(label));
  return [...new Set(labels)].slice(0, 3);
};

export const generateDomainGuesses = (
  candidate: Pick<CandidateQueueRow, 'company_name' | 'legal_name'>,
): CandidateDomainHint[] => brandLabels(candidate.company_name, candidate.legal_name)
  .flatMap((label) => ['com.br', 'com', 'io'].map((tld) => `${label}.${tld}`))
  .filter(isSafePublicDomain)
  .slice(0, 6)
  .map((domain) => ({ domain, strategy: 'name_guess' as const }));

const domainTrace = (candidate: CandidateQueueRow) => asRecord(candidate.raw_payload?.domain_intelligence);

export const isDomainResolutionInCooldown = (candidate: CandidateQueueRow, now: Date) => {
  if (!isWebsiteIdentityRetryDue(candidate.raw_payload, now)) return true;
  const nextRetry = Date.parse(String(domainTrace(candidate).nextRetryAt ?? ''));
  return Number.isFinite(nextRetry) && nextRetry > now.getTime();
};

const tradeNameFrom = (enrichments: OfficialEnrichmentRow[]) => enrichments
  .map((row) => String(row.data?.tradeName ?? row.data?.trade_name ?? '').trim())
  .find(Boolean) ?? null;

const acceptsMatch = (strategy: DomainHintStrategy, score: WebsiteIdentityScore) => {
  if (!score.verified) return false;
  if (strategy !== 'name_guess') return true;
  return score.matchType === 'cnpj' || (score.matchType === 'exact_name' && score.confidence >= 0.95);
};

export class CandidateDomainIntelligenceService {
  private readonly client: SupabaseClient | null;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(dependencies: Dependencies = {}) {
    this.client = dependencies.client === undefined ? getSupabaseClient() : dependencies.client;
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
    this.now = dependencies.now ?? (() => new Date());
  }

  private async probeCandidate(
    candidate: CandidateQueueRow,
    enrichments: OfficialEnrichmentRow[],
    hints: CandidateDomainHint[],
  ): Promise<ProbeMatch> {
    let probes = 0;
    let bestConfidence = 0;
    const tradeName = tradeNameFrom(enrichments);

    for (const hint of hints.slice(0, MAX_DOMAINS_PER_CANDIDATE)) {
      const domain = normalizeDomainCandidate(hint.domain);
      if (!isSafePublicDomain(domain)) continue;
      for (const url of [...new Set([`https://${domain}`, `https://www.${domain}`])]) {
        probes += 1;
        try {
          const response = await this.fetchImpl(url, {
            headers: {
              accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
              'user-agent': 'Motor-Origination-Domain-Intelligence/1.0',
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
          });
          if (!response.ok || !String(response.headers.get('content-type') ?? '').toLowerCase().includes('text/html')) continue;
          const html = (await response.text()).slice(0, MAX_HTML_CHARS);
          const finalUrl = response.url || url;
          const finalDomain = normalizeDomainCandidate(finalUrl) || domain;
          if (!isSafePublicDomain(finalDomain)) continue;
          const score = scoreWebsiteIdentity({
            cnpj: candidate.cnpj,
            companyName: candidate.company_name,
            legalName: candidate.legal_name,
            tradeName,
          }, finalDomain, html);
          bestConfidence = Math.max(bestConfidence, score.confidence);
          if (!acceptsMatch(hint.strategy, score)) continue;
          return { verified: true, probes, domain: finalDomain, website: finalUrl, score, strategy: hint.strategy, bestConfidence };
        } catch {
          // Bounded network misses are expected during domain discovery.
        }
      }
    }
    return { verified: false, probes, domain: null, website: null, score: null, strategy: null, bestConfidence };
  }

  async run(options: CandidateDomainIntelligenceOptions = {}): Promise<CandidateDomainIntelligenceResult> {
    if (!this.client) throw new Error('Supabase client not configured for candidate domain intelligence.');
    const limit = Math.min(Math.max(Math.trunc(options.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
    const tiers = [...new Set((options.tiers?.length ? options.tiers : ['P1', 'P2', 'P3']).map(String))];
    const candidateIds = [...new Set((options.candidateIds ?? []).map(String).filter(Boolean))].slice(0, MAX_LIMIT);
    const queryLimit = Math.min(MAX_QUERY_LIMIT, Math.max(limit * 3, limit));
    const targetSelector = candidateIds.length
      ? { column: 'id', operator: 'in' as const, value: candidateIds }
      : { column: 'priority_tier', operator: 'in' as const, value: tiers };

    const rows = await this.client.select('candidate_decision_queue_v4', {
      select: 'id,company_name,legal_name,cnpj,website,normalized_domain,candidate_status,priority_tier,source_url,evidence_summary,raw_payload',
      filters: [
        { column: 'canonical_rank', value: 1 },
        { column: 'queue_type', value: 'commercial' },
        { column: 'candidate_status', value: 'captured' },
        { column: 'cnpj_valid', value: true },
        targetSelector,
      ],
      orderBy: { column: 'priority_score', ascending: false },
      limit: queryLimit,
    }) as CandidateQueueRow[];

    const missing = rows.filter((row) => !normalizeDomainCandidate(row.website) && !normalizeDomainCandidate(row.normalized_domain));
    const now = this.now();
    const skippedCooldown = options.force ? 0 : missing.filter((row) => isDomainResolutionInCooldown(row, now)).length;
    const targets = missing.filter((row) => options.force || !isDomainResolutionInCooldown(row, now)).slice(0, limit);
    if (!targets.length) return {
      status: 'no_targets', scanned: rows.length, targetCount: 0, skippedCooldown,
      candidatesWithObservedHints: 0, generatedDomainGuesses: 0, domainsProbed: 0,
      websitesVerified: 0, candidatesUpdated: 0, unresolved: 0, errors: 0,
    };

    const ids = targets.map((row) => row.id);
    const enrichments = await this.client.select('candidate_official_enrichments', {
      select: 'candidate_id,dataset_code,source_url,data,observed_at',
      filters: [{ column: 'candidate_id', operator: 'in', value: ids }],
      limit: Math.min(Math.max(ids.length * 8, 100), 1_000),
    }) as OfficialEnrichmentRow[];
    const byCandidate = new Map<string, OfficialEnrichmentRow[]>();
    for (const enrichment of enrichments) {
      byCandidate.set(enrichment.candidate_id, [...(byCandidate.get(enrichment.candidate_id) ?? []), enrichment]);
    }

    let candidatesWithObservedHints = 0;
    let generatedDomainGuesses = 0;
    let domainsProbed = 0;
    let websitesVerified = 0;
    let candidatesUpdated = 0;
    let errors = 0;

    for (let offset = 0; offset < targets.length; offset += CONCURRENCY) {
      const batch = targets.slice(offset, offset + CONCURRENCY);
      const results = await Promise.all(batch.map(async (candidate) => {
        const observedAt = this.now().toISOString();
        try {
          const candidateEnrichments = byCandidate.get(candidate.id) ?? [];
          const observedHints = extractObservedDomainHints(candidate, candidateEnrichments);
          const guesses = generateDomainGuesses(candidate);
          const seen = new Set<string>();
          const hints = [...observedHints, ...guesses].filter((hint) => {
            const domain = normalizeDomainCandidate(hint.domain);
            if (!domain || seen.has(domain)) return false;
            seen.add(domain);
            return true;
          }).slice(0, MAX_DOMAINS_PER_CANDIDATE);
          const probe = await this.probeCandidate(candidate, candidateEnrichments, hints);
          const existingWebsiteCapture = asRecord(candidate.raw_payload?.website_identity_capture);
          const currentAttemptCount = Math.max(
            Number(existingWebsiteCapture.attemptCount) || 0,
            Number(domainTrace(candidate).attemptCount) || 0,
          );
          const attemptCount = currentAttemptCount + 1;
          const retryReason = hints.length ? 'insufficient_identity' as const : 'no_domain_hint' as const;
          const nextRetryAt = probe.verified ? null : websiteIdentityRetryAt(attemptCount, retryReason, this.now());
          const trace = {
            version: VERSION,
            status: probe.verified ? 'verified' : 'unresolved',
            attemptCount,
            lastAttemptAt: observedAt,
            nextRetryAt,
            strategiesUsed: [...new Set(hints.map((hint) => hint.strategy))],
            candidateDomains: hints.map((hint) => ({ domain: hint.domain, strategy: hint.strategy })),
            domainsProbed: probe.probes,
            bestConfidence: Number(probe.bestConfidence.toFixed(4)),
            humanApprovalRequired: true,
          };

          if (probe.verified && probe.website && probe.domain && probe.score && probe.strategy) {
            await this.client!.update('discovered_company_candidates', {
              website: probe.website,
              normalized_domain: probe.domain,
              raw_payload: {
                ...(candidate.raw_payload ?? {}),
                identity_evidence_url: probe.website,
                website_identity_capture: {
                  ...existingWebsiteCapture,
                  status: 'verified',
                  sourceCode: SOURCE_CODE,
                  website: probe.website,
                  domain: probe.domain,
                  confidence: probe.score.confidence,
                  matchType: probe.score.matchType,
                  cnpjMatched: probe.score.cnpjMatched,
                  domainAligned: probe.score.domainAligned,
                  matchedNameTokens: probe.score.matchedTokens,
                  attemptCount,
                  nextRetryAt: null,
                  domainResolutionVersion: VERSION,
                  resolutionStrategy: probe.strategy,
                  observedAt,
                  humanApprovalRequired: true,
                },
                domain_intelligence: {
                  ...trace,
                  verifiedDomain: probe.domain,
                  verifiedWebsite: probe.website,
                  confidence: probe.score.confidence,
                  matchType: probe.score.matchType,
                  resolutionStrategy: probe.strategy,
                },
              },
              updated_at: observedAt,
            }, [{ column: 'id', value: candidate.id }]);
            return { observed: observedHints.length > 0, guesses: guesses.length, probes: probe.probes, verified: true, updated: true, error: false };
          }

          await this.client!.update('discovered_company_candidates', {
            raw_payload: {
              ...(candidate.raw_payload ?? {}),
              website_identity_capture: {
                ...existingWebsiteCapture,
                status: 'unresolved',
                sourceCode: SOURCE_CODE,
                attemptCount,
                retryReason,
                nextRetryAt,
                domainResolutionVersion: VERSION,
                observedAt,
                humanApprovalRequired: true,
              },
              domain_intelligence: trace,
            },
            updated_at: observedAt,
          }, [{ column: 'id', value: candidate.id }]);
          return { observed: observedHints.length > 0, guesses: guesses.length, probes: probe.probes, verified: false, updated: false, error: false };
        } catch {
          return { observed: false, guesses: 0, probes: 0, verified: false, updated: false, error: true };
        }
      }));

      for (const result of results) {
        if (result.observed) candidatesWithObservedHints += 1;
        generatedDomainGuesses += result.guesses;
        domainsProbed += result.probes;
        if (result.verified) websitesVerified += 1;
        if (result.updated) candidatesUpdated += 1;
        if (result.error) errors += 1;
      }
    }

    return {
      status: 'completed', scanned: rows.length, targetCount: targets.length, skippedCooldown,
      candidatesWithObservedHints, generatedDomainGuesses, domainsProbed, websitesVerified,
      candidatesUpdated, unresolved: targets.length - candidatesUpdated - errors, errors,
    };
  }
}
