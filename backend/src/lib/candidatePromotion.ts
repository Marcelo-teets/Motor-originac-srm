import { createHash } from 'node:crypto';
import type { CompanySeed, SearchProfile } from '../types/platform.js';
import type { DiscoverySourceHit } from './discoveryCapture.js';
import { buildDiscoveryDedupeKey, normalizeDomain, normalizeCompanyName } from './discoveryCapture.js';

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

const normalizeCnpj = (value: string | undefined) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length === 14 ? digits : '';
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
  return {
    searchProfileId: profile.id,
    companyName: hit.companyName,
    legalName: hit.companyName,
    website: hit.website,
    normalizedDomain: normalizeDomain(hit.website),
    cnpj,
    geography: profile.geography || 'Brasil',
    segment: profile.segment,
    subsegment: profile.subsegment,
    companyType: profile.companyType,
    creditProduct: profile.creditProduct,
    targetStructure: profile.targetStructure,
    sourceRef: hit.sourceRef,
    sourceUrl: hit.sourceUrl,
    evidenceSummary: hit.evidenceSummary,
    receivables: profile.receivables,
    confidence: hit.confidence,
    dedupeKey: buildDiscoveryDedupeKey({ companyName: hit.companyName, website: hit.website, cnpj }),
    rawPayload: hit.rawPayload,
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
