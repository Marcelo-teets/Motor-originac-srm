import type { CompanySignal, EnrichmentRecord, MonitoringOutput } from '../../types/platform.js';

export type CaptureScopeType = 'global' | 'company' | 'source' | 'backfill';
export type CaptureTriggerType = 'manual' | 'scheduled' | 'cron' | 'orchestrated';
export type CaptureRunStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed';

export type CaptureRunRequest = {
  companyId?: string;
  sourceId?: string;
  scopeType: CaptureScopeType;
  triggerType: CaptureTriggerType;
};

export type CanonicalSourceDocument = {
  id: string;
  monitoringOutputId?: string;
  companyId?: string;
  sourceId: string;
  documentType: string;
  externalId?: string;
  canonicalUrl?: string;
  title?: string;
  publishedAt?: string;
  observedAt: string;
  contentHash?: string;
  rawPayload: Record<string, unknown>;
  normalizedPayload: Record<string, unknown>;
  extractionStatus: 'raw' | 'normalized' | 'enriched';
  confidenceScore: number;
};

export type TreatmentEvidenceLevel = 'observed' | 'inferred';

export type TreatmentResultRecord = {
  outputId: string;
  companyId: string;
  sourceId: string;
  treatmentVersion: string;
  contentFingerprint: string;
  relevanceScore: number;
  qualityScore: number;
  confidenceScore: number;
  evidenceLevel: TreatmentEvidenceLevel;
  signalFamilies: string[];
  suggestedStructures: string[];
  detectedKeywords: string[];
  normalizedFacts: Record<string, unknown>;
  qualityIssues: string[];
  recommendedNextAction: string;
  sourceUrl?: string;
  intrinsicDecisionEligible: boolean;
  lineage: Record<string, unknown>;
};

export type TreatmentDecisionGate = {
  eligibleOutputIds: string[];
  blockedOutputIds: string[];
  outputQualityStatus: Record<string, string>;
  outputBlockReason: Record<string, string>;
  allowedCompanySourcePairs: string[];
  blockedCompanySourcePairs: string[];
};

export type CaptureRunDiagnostics = {
  sourcesObserved: number;
  duplicatesDiscarded: number;
  partialConnectors: number;
  corroboratedThemes: string[];
  averageConfidence: number;
  treatment?: {
    treatmentVersion: string;
    outputsTreated: number;
    highRelevanceOutputs: number;
    decisionEligibleOutputs: number;
    treatmentGeneratedSignals: number;
    averageQualityScore: number;
    suggestedStructures: string[];
    dominantSignalFamilies: string[];
  };
};

export type CaptureEngineResult = {
  run: {
    scopeType: CaptureScopeType;
    triggerType: CaptureTriggerType;
    companyId?: string;
    sourceId?: string;
    status: CaptureRunStatus;
    itemsCollected: number;
    outputsWritten: number;
    signalsWritten: number;
    enrichmentsWritten: number;
    diagnostics?: CaptureRunDiagnostics;
  };
  documents: CanonicalSourceDocument[];
  outputs: MonitoringOutput[];
  signals: CompanySignal[];
  enrichments: EnrichmentRecord[];
  treatmentResults: TreatmentResultRecord[];
};
