import type { CompanySignal, EnrichmentRecord, MonitoringOutput } from '../../types/platform.js';

export type CaptureScopeType = 'global' | 'company' | 'source' | 'backfill';
export type CaptureTriggerType = 'manual' | 'scheduled' | 'orchestrated';
export type CaptureRunStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed';

export type CaptureRunRequest = {
  companyId?: string;
  sourceId?: string;
  scopeType: CaptureScopeType;
  triggerType: CaptureTriggerType;
};

export type CanonicalSourceDocument = {
  id: string;
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
  };
  documents: CanonicalSourceDocument[];
  outputs: MonitoringOutput[];
  signals: CompanySignal[];
  enrichments: EnrichmentRecord[];
};
