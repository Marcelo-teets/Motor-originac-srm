import { getSupabaseClient } from '../lib/supabase.js';

export type GoldCompanySignalFeature = {
  companyId: string;
  canonicalCnpj: string | null;
  companyName: string;
  sourceId: string | null;
  sourceCode: string | null;
  sourceTier: string | null;
  signalType: string;
  signalLabel: string;
  signalStrength: number;
  confidenceScore: number;
  featureScore: number;
  observedAt: string;
  evidenceUrl: string | null;
  evidenceText: string | null;
};

export type GoldCompanySourceFeature = {
  companyId: string;
  canonicalCnpj: string | null;
  companyName: string;
  sourceId: string | null;
  sourceCode: string | null;
  sourceTier: string | null;
  signalCount: number;
  documentCount: number;
  maxFeatureScore: number;
  avgConfidenceScore: number;
  lastObservedAt: string | null;
};

export type GoldCompanyProfile = {
  companyId: string;
  canonicalCnpj: string | null;
  companyName: string;
  signalCount: number;
  sourceCount: number;
  documentCount: number;
  latestEvidenceAt: string | null;
  strongestFeatureScore: number;
  avgConfidenceScore: number;
};

type QueryOptions = {
  companyId?: string;
  limit?: number;
};

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export class DataPlatformGoldRepository {
  private readonly client = getSupabaseClient();

  private async selectGoldView<T>(viewName: string, mapper: (row: any) => T, options: QueryOptions = {}) {
    if (!this.client) return [] as T[];

    try {
      const rows = await this.client.select(viewName, {
        select: '*',
        ...(options.companyId ? { filters: [{ column: 'company_id', value: options.companyId }] } : {}),
        ...(options.limit ? { limit: options.limit } : {}),
      });
      return (rows ?? []).map(mapper);
    } catch {
      return [] as T[];
    }
  }

  async listCompanySignalFeatures(options: QueryOptions = {}) {
    return this.selectGoldView<GoldCompanySignalFeature>('gold_company_signal_features', (row) => ({
      companyId: row.company_id,
      canonicalCnpj: row.canonical_cnpj ?? null,
      companyName: row.company_name,
      sourceId: row.source_id ?? null,
      sourceCode: row.source_code ?? null,
      sourceTier: row.source_tier ?? null,
      signalType: row.signal_type,
      signalLabel: row.signal_label,
      signalStrength: toNumber(row.signal_strength),
      confidenceScore: toNumber(row.confidence_score),
      featureScore: toNumber(row.feature_score),
      observedAt: row.observed_at,
      evidenceUrl: row.evidence_url ?? null,
      evidenceText: row.evidence_text ?? null,
    }), options);
  }

  async listCompanySourceFeatures(options: QueryOptions = {}) {
    return this.selectGoldView<GoldCompanySourceFeature>('gold_company_source_features', (row) => ({
      companyId: row.company_id,
      canonicalCnpj: row.canonical_cnpj ?? null,
      companyName: row.company_name,
      sourceId: row.source_id ?? null,
      sourceCode: row.source_code ?? null,
      sourceTier: row.source_tier ?? null,
      signalCount: toNumber(row.signal_count),
      documentCount: toNumber(row.document_count),
      maxFeatureScore: toNumber(row.max_feature_score),
      avgConfidenceScore: toNumber(row.avg_confidence_score),
      lastObservedAt: row.last_observed_at ?? null,
    }), options);
  }

  async listCompanyProfiles(options: QueryOptions = {}) {
    return this.selectGoldView<GoldCompanyProfile>('gold_company_profiles', (row) => ({
      companyId: row.company_id,
      canonicalCnpj: row.canonical_cnpj ?? null,
      companyName: row.company_name,
      signalCount: toNumber(row.signal_count),
      sourceCount: toNumber(row.source_count),
      documentCount: toNumber(row.document_count),
      latestEvidenceAt: row.latest_evidence_at ?? null,
      strongestFeatureScore: toNumber(row.strongest_feature_score),
      avgConfidenceScore: toNumber(row.avg_confidence_score),
    }), options);
  }
}
