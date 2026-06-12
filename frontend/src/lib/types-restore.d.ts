import './types';

declare module './types' {
  export type SearchProfileCandidate = {
    id: string;
    searchProfileId: string;
    companyName: string;
    website?: string;
    segment: string;
    sourceRef: string;
    evidenceSummary: string;
    confidence: number;
    status: 'captured' | 'promoted';
    promoted: boolean;
    capturedAt: string;
    promotedAt?: string;
  };

  export type SearchProfileDraft = {
    segment: string;
    subsegment: string;
    companyType: string;
    geography: string;
    creditProduct: string;
    receivables: string;
    targetStructure: string;
    signalIntensity: string;
    minimumConfidence: string;
    timeWindow: string;
  };
}
