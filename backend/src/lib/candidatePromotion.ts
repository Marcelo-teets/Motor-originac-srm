import { createHash } from 'node:crypto';
import type { CompanySeed, SearchProfile } from '../types/platform.js';
import type { DiscoverySourceHit } from './discoveryCapture.js';
import { buildDiscoveryDedupeKey, normalizeDomain, normalizeCompanyName } from './discoveryCapture.js';
import { applyCandidateCommercialSemantics } from './candidateCommercialSemantics.js';
import { normalizeCnpjIdentity } from './cnpjIdentity.js';

export type DiscoveredCandidateDraft = {
  searchProfileId?: string;
  companyName: string;
  legalName?: string;
  website?: string;
  normalizedDomain?: string;
  cnpj?: string;
  geography: string;
  segment: string;
  subsegment: string;
  companyType: string;
  creditProduct: string;
  targetStructure: string;
  sourceRef: string;
  sourceUrl?: string;
  evidenceSummary: string;
  receivables: string[];
  confidence: number;
  dedupeKey: string;
  rawPayload: Record<string, unknown>;
};

// Identity normalization is not identity approval: legal evidence, RFB checksum,
// reviewer and Company Master linkage are enforced by promotion readiness.
// Preserve all 12 alphanumeric RFB-2026 characters instead of stripping letters
// and falling back to a name-derived UUID (which could merge two companies).
const normalizeCnpj = (value: string | undefined) => {
  const normalized = normalizeCnpjIdentity(value);
  return /^[A-Z0-9]{12}[0-9]{2}$/.test(normalized) ? normalized : '';
};

export const deterministicCompanyUuid = (candidate: Pick<DiscoveredCandidateDraft, 'companyName' | 'cnpj'>) => {
  const identity = normalizeCnpj(candidate.cnpj) || normalizeCompanyName(candidate.companyName);
  const bytes = createHash('sha256').update(`motor-company:${identity}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const discoveryHitToCandidateDraft = (profile: SearchProfile, hit: DiscoverySourceHit): DiscoveredCandidateDraft => {
  const cnpj = normalizeCnpj(hit.cnpj) || undefined;
  const portfolioOnly = hit.sourceRef.startsWith('vc-portfolio:')
    || hit.rawPayload.origin === 'vc_portfolio_page';
  const sourceSemantics = applyCandidateCommercialSemantics({
    companyName: hit.companyName,
    sourceRef: hit.sourceRef,
    evidenceSummary: hit.evidenceSummary,
    rawPayload: hit.rawPayload,
  });
  // A VC portfolio establishes membership/visibility, not credit product,
  // legal identity, receivables, Brazil operation or ICP. Keep the profile
  // attributes as search hypotheses only; never count them as observed facts.
  const rawPayload = portfolioOnly ? {
    ...sourceSemantics,
    profileAttributeVerification: 'unverified_portfolio_only',
    searchProfileHypothesis: {
      segment: profile.segment,
      subsegment: profile.subsegment,
      companyType: profile.companyType,
      creditProduct: profile.creditProduct,
      targetStructure: profile.targetStructure,
      geography: profile.geography,
      receivables: profile.receivables,
    },
  } : sourceSemantics;
  return {
    searchProfileId: profile.id,
    companyName: hit.companyName,
    legalName: portfolioOnly ? undefined : hit.companyName,
    website: hit.website,
    normalizedDomain: normalizeDomain(hit.website),
    cnpj,
    geography: portfolioOnly ? 'Unverified' : (profile.geography || 'Brasil'),
    segment: portfolioOnly ? 'Unverified' : profile.segment,
    subsegment: portfolioOnly ? 'Unverified' : profile.subsegment,
    companyType: portfolioOnly ? 'Unverified' : profile.companyType,
    creditProduct: portfolioOnly ? 'Unknown' : profile.creditProduct,
    targetStructure: portfolioOnly ? 'Unknown' : profile.targetStructure,
    sourceRef: hit.sourceRef,
    sourceUrl: hit.sourceUrl,
    evidenceSummary: hit.evidenceSummary,
    receivables: portfolioOnly ? [] : profile.receivables,
    confidence: hit.confidence,
    dedupeKey: buildDiscoveryDedupeKey({ companyName: hit.companyName, website: hit.website, cnpj }),
    rawPayload,
  };
};

export const candidateDraftToCompanySeed = (candidate: DiscoveredCandidateDraft): CompanySeed => {
  const origin = typeof candidate.rawPayload?.origin === 'string' ? candidate.rawPayload.origin : 'search_profile';
  const signalType = origin === 'cvm_capital_market_event'
    ? 'captured_from_capital_market_event'
    : 'captured_from_search_profile';

  return {
    id: deterministicCompanyUuid(candidate),
    legalName: candidate.legalName ?? candidate.companyName,
    tradeName: candidate.companyName,
    cnpj: normalizeCnpj(candidate.cnpj),
    website: candidate.website ?? '',
    geography: candidate.geography,
    segment: candidate.segment,
    subsegment: candidate.subsegment,
    companyType: candidate.companyType,
    stage: 'Identified',
    creditProduct: candidate.creditProduct,
    receivables: candidate.receivables,
    currentFundingStructure: 'Unknown',
    description: candidate.evidenceSummary,
    signals: [
      {
        type: signalType,
        strength: Math.round(candidate.confidence * 100),
        confidence: candidate.confidence,
        note: candidate.evidenceSummary,
        source: candidate.sourceRef,
      },
    ],
    monitoring: {
      status: 'queued',
      lastRunAt: '',
      outputs24h: 0,
      triggers24h: 0,
      websiteChanges: [],
      feedHighlights: [],
    },
    enrichment: {
      governanceMaturity: 'medium',
      underwritingMaturity: 'medium',
      operationalMaturity: 'medium',
      riskModelMaturity: 'medium',
      unitEconomicsQuality: 'mixed',
      spreadVsFundingQuality: 'neutral',
      concentrationRisk: 'medium',
      delinquencySignal: 'low',
      sourceConfidence: candidate.confidence,
      sourceNotes: [candidate.evidenceSummary],
    },
    sourceRecords: [
      {
        sourceId: candidate.sourceRef,
        externalId: candidate.dedupeKey,
        observedAt: new Date().toISOString(),
        payload: {
          sourceUrl: candidate.sourceUrl ?? null,
          evidenceSummary: candidate.evidenceSummary,
          rawPayload: candidate.rawPayload,
        },
      },
    ],
    marketMapPeers: [],
    activities: [
      {
        title: 'Validar candidato capturado e priorizar abordagem inicial',
        owner: 'Origination',
        status: 'open',
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      },
    ],
  };
};
