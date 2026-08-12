import { getSupabaseClient } from '../lib/supabase.js';

const SOURCE_CODE = 'src_company_website';
const CVM_DATASET_CODE = 'cvm_open_company_registry_candidates';
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const TARGET_POOL_LIMIT = 250;
const PROBE_TIMEOUT_MS = 6_000;
const CONCURRENCY = 4;

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'live.com',
  'yahoo.com', 'yahoo.com.br', 'icloud.com', 'me.com', 'uol.com.br',
  'bol.com.br', 'terra.com.br', 'proton.me', 'protonmail.com',
]);

const LEGAL_NAME_STOPWORDS = new Set([
  'sa', 's', 'a', 'ltda', 'limitada', 'eireli', 'sociedade', 'anonima',
  'participacoes', 'participacao', 'empreendimentos', 'servicos', 'brasil',
  'companhia', 'cia', 'holding', 'grupo', 'de', 'da', 'do', 'das', 'dos', 'e',
]);

const asRecord = (value: unknown): Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const firstText = (...values: unknown[]) => String(
  values.find((value) => typeof value === 'string' && value.trim()) ?? '',
).trim();

const normalizeText = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

const normalizeDomain = (value: unknown) => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./, '').replace(/\.$/, '');
  } catch {
    return raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]?.replace(/\.$/, '') ?? '';
  }
};

const domainLabel = (domain: string) => {
  const parts = normalizeDomain(domain).split('.').filter(Boolean);
  if (parts.length < 2) return parts[0] ?? '';
  if (parts.length >= 3 && parts.at(-1) === 'br' && ['com', 'net', 'org', 'eco'].includes(parts.at(-2) ?? '')) {
    return parts.at(-3) ?? '';
  }
  return parts.at(-2) ?? '';
};

const htmlToText = (html: string) => normalizeText(
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' '),
);

const pageTitle = (html: string) => normalizeText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').slice(0, 180);

const cnpjPattern = (cnpj: string) => {
  const value = digits(cnpj);
  if (value.length !== 14) return null;
  return new RegExp(
    `(^|\\D)${value.slice(0, 2)}[.\\s]*${value.slice(2, 5)}[.\\s]*${value.slice(5, 8)}[\\/\\s]*${value.slice(8, 12)}[-\\s]*${value.slice(12)}(\\D|$)`,
    'i',
  );
};

export const significantNameTokens = (...values: unknown[]) => {
  const tokens = values
    .flatMap((value) => normalizeText(value).split(' '))
    .filter((token) => token.length >= 3 && !LEGAL_NAME_STOPWORDS.has(token));
  return [...new Set(tokens)];
};

export const extractCandidateDomains = (data: Record<string, unknown> | null | undefined) => {
  const raw = asRecord(data?.rawPayload);
  const candidates = [raw.email, raw.email_resp, data?.email, data?.emailResp]
    .flatMap((value) => String(value ?? '').split(/[;,\s]+/))
    .map((value) => value.match(/@([a-z0-9.-]+\.[a-z]{2,})$/i)?.[1] ?? '')
    .map(normalizeDomain)
    .filter((domain) => Boolean(domain) && !FREE_EMAIL_DOMAINS.has(domain));
  return [...new Set(candidates)].slice(0, 3);
};

export type WebsiteIdentityCandidate = {
  cnpj: string | null;
  companyName: string | null;
  legalName: string | null;
  tradeName?: string | null;
};

export type WebsiteIdentityScore = {
  verified: boolean;
  confidence: number;
  matchType: 'cnpj' | 'name_and_domain' | 'exact_name' | 'insufficient';
  matchedTokens: string[];
  domainAligned: boolean;
  cnpjMatched: boolean;
};

export const scoreWebsiteIdentity = (
  candidate: WebsiteIdentityCandidate,
  domain: string,
  html: string,
): WebsiteIdentityScore => {
  const text = htmlToText(html);
  const title = pageTitle(html);
  const pattern = cnpjPattern(candidate.cnpj ?? '');
  const cnpjMatched = Boolean(pattern?.test(html.replace(/&nbsp;/gi, ' ')));
  const tokens = significantNameTokens(candidate.companyName, candidate.legalName, candidate.tradeName);
  const matchedTokens = tokens.filter((token) => text.includes(token));
  const label = normalizeText(domainLabel(domain)).replace(/\s/g, '');
  const domainAligned = Boolean(label) && tokens.some((token) => token.includes(label) || label.includes(token));
  const exactNames = [candidate.companyName, candidate.legalName, candidate.tradeName]
    .map(normalizeText)
    .filter((value) => value.length >= 6);
  const exactName = exactNames.some((value) => text.includes(value) || title.includes(value));
  const coverage = tokens.length ? matchedTokens.length / tokens.length : 0;

  if (cnpjMatched) {
    return { verified: true, confidence: 0.99, matchType: 'cnpj', matchedTokens, domainAligned, cnpjMatched };
  }
  if (exactName && (domainAligned || matchedTokens.length >= 2)) {
    return { verified: true, confidence: 0.95, matchType: 'exact_name', matchedTokens, domainAligned, cnpjMatched };
  }
  if (domainAligned && matchedTokens.length >= 1 && coverage >= 0.4) {
    return { verified: true, confidence: 0.90, matchType: 'name_and_domain', matchedTokens, domainAligned, cnpjMatched };
  }
  return { verified: false, confidence: Math.min(0.79, 0.45 + coverage * 0.25), matchType: 'insufficient', matchedTokens, domainAligned, cnpjMatched };
};

type RetryReason = 'no_domain_hint' | 'site_unreachable' | 'no_html_evidence' | 'insufficient_identity';

const retryBaseHours = (reason: RetryReason) => {
  if (reason === 'site_unreachable') return 24;
  if (reason === 'no_html_evidence') return 72;
  return 168;
};

export const websiteIdentityRetryAt = (attemptCount: number, reason: RetryReason, now: Date) => {
  const exponent = Math.min(Math.max(attemptCount - 1, 0), 3);
  const hours = Math.min(retryBaseHours(reason) * (2 ** exponent), 720);
  return new Date(now.getTime() + hours * 60 * 60 * 1_000).toISOString();
};

export const isWebsiteIdentityRetryDue = (
  rawPayload: Record<string, unknown> | null | undefined,
  now: Date,
) => {
  const capture = asRecord(rawPayload?.website_identity_capture);
  if (capture.status !== 'unresolved') return true;
  const retryAt = Date.parse(String(capture.nextRetryAt ?? ''));
  return !Number.isFinite(retryAt) || retryAt <= now.getTime();
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
  confidence?: number | string | null;
  evidence_summary?: string | null;
  raw_payload?: Record<string, unknown> | null;
};

type OfficialEnrichmentRow = {
  candidate_id: string;
  source_url: string | null;
  data?: Record<string, unknown> | null;
  observed_at?: string | null;
};

type SourceRow = { id: string; metadata?: Record<string, unknown> | null };
type SupabaseClient = NonNullable<ReturnType<typeof getSupabaseClient>>;

export type CandidateWebsiteIdentityOptions = { limit?: number };
export type CandidateWebsiteIdentityResult = {
  status: 'completed' | 'no_targets';
  targetCount: number;
  deferredByBackoff: number;
  candidatesWithDomainHints: number;
  domainsProbed: number;
  websitesVerified: number;
  candidatesUpdated: number;
  reviewPrefillsPrepared: number;
  retryStatesUpdated: number;
  unresolved: number;
  errors: number;
};

type Dependencies = {
  client?: SupabaseClient | null;
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

const officialLegalName = (candidate: CandidateQueueRow, rows: OfficialEnrichmentRow[]) => {
  for (const row of rows) {
    const data = asRecord(row.data);
    const raw = asRecord(data.rawPayload);
    const value = firstText(raw.denom_social, data.companyName, candidate.legal_name, candidate.company_name);
    if (value) return value;
  }
  return firstText(candidate.legal_name, candidate.company_name);
};

const buildReviewEvidenceSummary = (
  candidate: CandidateQueueRow,
  enrichment: OfficialEnrichmentRow | undefined,
  finalUrl: string,
  score: WebsiteIdentityScore,
) => {
  const data = asRecord(enrichment?.data);
  const registrationSituation = firstText(data.registrationSituation, 'situação não informada');
  const legalName = officialLegalName(candidate, enrichment ? [enrichment] : []);
  const cnpj = digits(candidate.cnpj);
  const method = score.matchType === 'cnpj'
    ? 'CNPJ encontrado no próprio site'
    : score.matchType === 'exact_name'
      ? 'razão social exata e domínio compatível'
      : 'nome societário e domínio compatíveis';
  return `O cadastro oficial da CVM confirma ${legalName} (CNPJ ${cnpj}) com situação ${registrationSituation}. `
    + `O website ${finalUrl} foi verificado por ${method}, com confiança ${(score.confidence * 100).toFixed(0)}%. `
    + 'Esta evidência serve apenas para revisão humana de identidade; produto de crédito, recebíveis, funding e fit estrutural permanecem sem inferência automática.';
};

export class CandidateWebsiteIdentityService {
  private readonly client: SupabaseClient | null;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(dependencies: Dependencies = {}) {
    this.client = dependencies.client === undefined ? getSupabaseClient() : dependencies.client;
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
    this.now = dependencies.now ?? (() => new Date());
  }

  async run(options: CandidateWebsiteIdentityOptions = {}): Promise<CandidateWebsiteIdentityResult> {
    if (!this.client) throw new Error('Supabase client not configured for candidate website identity capture.');
    const limit = Math.min(Math.max(Math.trunc(options.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
    const now = this.now();
    const poolLimit = Math.min(TARGET_POOL_LIMIT, Math.max(limit * 4, limit));
    const targets = await this.client.select('candidate_decision_queue_v4', {
      select: 'id,company_name,legal_name,cnpj,website,normalized_domain,candidate_status,priority_tier,confidence,evidence_summary,raw_payload',
      filters: [
        { column: 'canonical_rank', value: 1 },
        { column: 'queue_type', value: 'commercial' },
        { column: 'priority_tier', operator: 'in', value: ['P1', 'P2'] },
        { column: 'candidate_status', value: 'captured' },
        { column: 'cnpj_valid', value: true },
        { column: 'is_cvm_open_company_current', value: true },
      ],
      orderBy: { column: 'priority_score', ascending: false },
      limit: poolLimit,
    }) as CandidateQueueRow[];

    const withoutWebsite = targets.filter((row) => !normalizeDomain(row.website) && !normalizeDomain(row.normalized_domain));
    const deferredByBackoff = withoutWebsite.filter((row) => !isWebsiteIdentityRetryDue(row.raw_payload, now)).length;
    const candidates = withoutWebsite
      .filter((row) => isWebsiteIdentityRetryDue(row.raw_payload, now))
      .slice(0, limit);

    if (!candidates.length) {
      return {
        status: 'no_targets', targetCount: 0, deferredByBackoff,
        candidatesWithDomainHints: 0, domainsProbed: 0, websitesVerified: 0,
        candidatesUpdated: 0, reviewPrefillsPrepared: 0, retryStatesUpdated: 0,
        unresolved: 0, errors: 0,
      };
    }

    const ids = candidates.map((row) => row.id);
    const enrichments = await this.client.select('candidate_official_enrichments', {
      select: 'candidate_id,source_url,data,observed_at',
      filters: [
        { column: 'candidate_id', operator: 'in', value: ids },
        { column: 'dataset_code', value: CVM_DATASET_CODE },
        { column: 'enrichment_type', value: 'cvm_open_company_registry' },
      ],
      limit: Math.max(ids.length * 4, 100),
    }) as OfficialEnrichmentRow[];
    const sourceRows = await this.client.select('source_catalog', { select: 'id,metadata', limit: 500 }) as SourceRow[];
    const sourceId = sourceRows.find((row) => row.metadata?.code === SOURCE_CODE)?.id ?? null;

    const byCandidate = new Map<string, OfficialEnrichmentRow[]>();
    for (const enrichment of enrichments) {
      byCandidate.set(enrichment.candidate_id, [...(byCandidate.get(enrichment.candidate_id) ?? []), enrichment]);
    }

    let candidatesWithDomainHints = 0;
    let domainsProbed = 0;
    let websitesVerified = 0;
    let candidatesUpdated = 0;
    let reviewPrefillsPrepared = 0;
    let retryStatesUpdated = 0;
    let errors = 0;

    const persistUnresolved = async (
      candidate: CandidateQueueRow,
      reason: RetryReason,
      domainHints: string[],
      probes: number,
    ) => {
      const existingCapture = asRecord(candidate.raw_payload?.website_identity_capture);
      const attemptCount = Math.max(0, Number(existingCapture.attemptCount) || 0) + 1;
      const observedAt = now.toISOString();
      const nextRetryAt = websiteIdentityRetryAt(attemptCount, reason, now);
      await this.client!.update('discovered_company_candidates', {
        raw_payload: {
          ...(candidate.raw_payload ?? {}),
          website_identity_capture: {
            ...existingCapture,
            status: 'unresolved',
            sourceCode: SOURCE_CODE,
            sourceId,
            domainHintSource: CVM_DATASET_CODE,
            domainHints,
            probes,
            attemptCount,
            lastAttemptAt: observedAt,
            nextRetryAt,
            lastReason: reason,
            humanApprovalRequired: true,
          },
        },
        updated_at: observedAt,
      }, [{ column: 'id', value: candidate.id }]);
    };

    for (let offset = 0; offset < candidates.length; offset += CONCURRENCY) {
      const batch = candidates.slice(offset, offset + CONCURRENCY);
      const results = await Promise.all(batch.map(async (candidate) => {
        try {
          const candidateEnrichments = byCandidate.get(candidate.id) ?? [];
          const domainHints = [...new Set(candidateEnrichments.flatMap((row) => extractCandidateDomains(row.data)))];
          if (!domainHints.length) {
            await persistUnresolved(candidate, 'no_domain_hint', [], 0);
            return { hints: false, probes: 0, verified: false, updated: false, prefill: false, retry: true, error: false };
          }

          let probes = 0;
          let reachableResponse = false;
          let htmlEvidenceSeen = false;
          for (const domain of domainHints) {
            const urls = [`https://${domain}`, `https://www.${domain}`];
            for (const url of urls) {
              probes += 1;
              try {
                const response = await this.fetchImpl(url, {
                  headers: {
                    accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
                    'user-agent': 'Motor-Origination-Identity-Capture/1.1',
                  },
                  redirect: 'follow',
                  signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
                });
                reachableResponse = true;
                if (!response.ok || !String(response.headers.get('content-type') ?? '').toLowerCase().includes('text/html')) continue;
                htmlEvidenceSeen = true;
                const html = (await response.text()).slice(0, 1_500_000);
                const finalUrl = response.url || url;
                const finalDomain = normalizeDomain(finalUrl) || domain;
                const tradeName = candidateEnrichments
                  .map((row) => firstText(asRecord(row.data).tradeName))
                  .find(Boolean) ?? null;
                const score = scoreWebsiteIdentity({
                  cnpj: candidate.cnpj,
                  companyName: candidate.company_name,
                  legalName: candidate.legal_name,
                  tradeName,
                }, finalDomain, html);
                if (!score.verified) continue;

                const observedAt = now.toISOString();
                const officialSourceUrl = candidateEnrichments.find((row) => row.source_url)?.source_url ?? null;
                const primaryEnrichment = candidateEnrichments[0];
                const legalName = officialLegalName(candidate, candidateEnrichments);
                const reviewEvidenceSummary = buildReviewEvidenceSummary(candidate, primaryEnrichment, finalUrl, score);
                const existingCapture = asRecord(candidate.raw_payload?.website_identity_capture);
                const attemptCount = Math.max(0, Number(existingCapture.attemptCount) || 0) + 1;
                const rawPayload = {
                  ...(candidate.raw_payload ?? {}),
                  identity_evidence_url: finalUrl,
                  review_legal_name: legalName,
                  review_cnpj: digits(candidate.cnpj),
                  review_website: finalUrl,
                  review_evidence_summary: reviewEvidenceSummary,
                  review_confidence: score.confidence,
                  website_identity_capture: {
                    ...existingCapture,
                    status: 'verified',
                    sourceCode: SOURCE_CODE,
                    sourceId,
                    website: finalUrl,
                    domain: finalDomain,
                    confidence: score.confidence,
                    matchType: score.matchType,
                    cnpjMatched: score.cnpjMatched,
                    domainAligned: score.domainAligned,
                    matchedNameTokens: score.matchedTokens,
                    domainHintSource: CVM_DATASET_CODE,
                    domainHints,
                    officialSourceUrl,
                    attemptCount,
                    lastAttemptAt: observedAt,
                    nextRetryAt: null,
                    lastReason: null,
                    observedAt,
                    humanApprovalRequired: true,
                  },
                };

                await this.client!.update('discovered_company_candidates', {
                  website: finalUrl,
                  normalized_domain: finalDomain,
                  raw_payload: rawPayload,
                  updated_at: observedAt,
                }, [{ column: 'id', value: candidate.id }]);
                return { hints: true, probes, verified: true, updated: true, prefill: true, retry: false, error: false };
              } catch {
                // Unreachable variants are aggregated into a bounded retry state below.
              }
            }
          }

          const reason: RetryReason = !reachableResponse
            ? 'site_unreachable'
            : !htmlEvidenceSeen
              ? 'no_html_evidence'
              : 'insufficient_identity';
          await persistUnresolved(candidate, reason, domainHints, probes);
          return { hints: true, probes, verified: false, updated: false, prefill: false, retry: true, error: false };
        } catch {
          return { hints: false, probes: 0, verified: false, updated: false, prefill: false, retry: false, error: true };
        }
      }));

      for (const result of results) {
        if (result.hints) candidatesWithDomainHints += 1;
        domainsProbed += result.probes;
        if (result.verified) websitesVerified += 1;
        if (result.updated) candidatesUpdated += 1;
        if (result.prefill) reviewPrefillsPrepared += 1;
        if (result.retry) retryStatesUpdated += 1;
        if (result.error) errors += 1;
      }
    }

    return {
      status: 'completed',
      targetCount: candidates.length,
      deferredByBackoff,
      candidatesWithDomainHints,
      domainsProbed,
      websitesVerified,
      candidatesUpdated,
      reviewPrefillsPrepared,
      retryStatesUpdated,
      unresolved: candidates.length - candidatesUpdated,
      errors,
    };
  }
}
