import type { CompanySeed, SearchProfile } from '../types/platform.js';
import type { DiscoverySourceHit } from './discoveryCapture.js';
import { buildDiscoveryDedupeKey, normalizeDomain, normalizeCompanyName } from './discoveryCapture.js';

export type DiscoveredCandidateDraft = {
  searchProfileId: string;
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

const companyIdFromName = (companyName: string) => `cmp_${normalizeCompanyName(companyName)}`;

export const discoveryHitToCandidateDraft = (profile: SearchProfile, hit: DiscoverySourceHit): DiscoveredCandidateDraft => ({
  searchProfileId: profile.id,
  companyName: hit.companyName,
  legalName: hit.companyName,
  website: hit.website,
  normalizedDomain: normalizeDomain(hit.website),
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
  dedupeKey: buildDiscoveryDedupeKey({ companyName: hit.companyName, website: hit.website }),
  rawPayload: hit.rawPayload,
});

export const candidateDraftToCompanySeed = (candidate: DiscoveredCandidateDraft): CompanySeed => ({
  id: companyIdFromName(candidate.companyName),
  legalName: candidate.legalName ?? candidate.companyName,
  tradeName: candidate.companyName,
  cnpj: candidate.cnpj ?? '',
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
      type: 'captured_from_search_profile',
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
});
