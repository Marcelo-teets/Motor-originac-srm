import { companySeeds, patternCatalogSeeds, searchProfileSeeds, sourceCatalogSeeds } from '../data/platformSeeds.js';
import { getSupabaseClient } from '../lib/supabase.js';
import type {
  CompanyPattern,
  CompanySeed,
  LeadScoreSnapshot,
  MonitoringOutput,
  PatternCatalogEntry,
  QualificationSnapshot,
  ScoreSnapshot,
  SearchProfile,
  SourceCatalogEntry,
} from '../types/platform.js';

export interface PlatformRepository {
  listCompanies(): Promise<CompanySeed[]>;
  listSearchProfiles(): Promise<SearchProfile[]>;
  listSources(): Promise<SourceCatalogEntry[]>;
  listPatternCatalog(): Promise<PatternCatalogEntry[]>;
  listMonitoringOutputs(): Promise<MonitoringOutput[]>;
  saveMonitoringOutputs(outputs: MonitoringOutput[]): Promise<void>;
  saveQualificationSnapshots(items: QualificationSnapshot[]): Promise<void>;
  saveCompanyPatterns(items: CompanyPattern[]): Promise<void>;
  saveScoreSnapshots(items: ScoreSnapshot[]): Promise<void>;
  saveLeadScoreSnapshots(items: LeadScoreSnapshot[]): Promise<void>;
  seedBaseData(): Promise<void>;
}

class MemoryPlatformRepository implements PlatformRepository {
  private companies = structuredClone(companySeeds);
  private searchProfiles = structuredClone(searchProfileSeeds);
  private sources = structuredClone(sourceCatalogSeeds);
  private patternCatalog = structuredClone(patternCatalogSeeds);
  private monitoringOutputs: MonitoringOutput[] = [];
  private qualificationSnapshots: QualificationSnapshot[] = [];
  private companyPatterns: CompanyPattern[] = [];
  private scoreSnapshots: ScoreSnapshot[] = [];
  private leadScoreSnapshots: LeadScoreSnapshot[] = [];

  async listCompanies() { return structuredClone(this.companies); }
  async listSearchProfiles() { return structuredClone(this.searchProfiles); }
  async listSources() { return structuredClone(this.sources); }
  async listPatternCatalog() { return structuredClone(this.patternCatalog); }
  async listMonitoringOutputs() { return structuredClone(this.monitoringOutputs); }
  async saveMonitoringOutputs(outputs: MonitoringOutput[]) { this.monitoringOutputs = outputs; }
  async saveQualificationSnapshots(items: QualificationSnapshot[]) { this.qualificationSnapshots = items; }
  async saveCompanyPatterns(items: CompanyPattern[]) { this.companyPatterns = items; }
  async saveScoreSnapshots(items: ScoreSnapshot[]) { this.scoreSnapshots = items; }
  async saveLeadScoreSnapshots(items: LeadScoreSnapshot[]) { this.leadScoreSnapshots = items; }
  async seedBaseData() { return; }
}

class SupabasePlatformRepository implements PlatformRepository {
  private client = getSupabaseClient();

  private ensureClient() {
    if (!this.client) throw new Error('Supabase client not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/ANON key.');
    return this.client;
  }

  async listCompanies() {
    const client = this.ensureClient();
    const data = await client.select('companies', { select: '*' });
    return (data ?? []).map((row: any) => ({
      id: row.id,
      legalName: row.legal_name,
      tradeName: row.trade_name ?? row.legal_name,
      cnpj: row.cnpj ?? '',
      website: row.website ?? '',
      geography: row.geography ?? 'Brasil',
      segment: row.segment ?? 'Unknown',
      subsegment: row.subsegment ?? 'Unknown',
      companyType: row.company_type ?? 'Unknown',
      stage: row.stage ?? 'Unknown',
      creditProduct: row.observed_payload?.credit_product ?? 'Unknown',
      receivables: row.observed_payload?.receivables ?? [],
      currentFundingStructure: row.current_funding_structure ?? 'Unknown',
      description: row.observed_payload?.description ?? '',
      signals: row.observed_payload?.signals ?? [],
      monitoring: row.observed_payload?.monitoring ?? { status: 'queued', lastRunAt: null, outputs24h: 0, triggers24h: 0, websiteChanges: [], feedHighlights: [] },
      enrichment: row.inferred_payload?.enrichment ?? { governanceMaturity: 'medium', underwritingMaturity: 'medium', operationalMaturity: 'medium', riskModelMaturity: 'medium', unitEconomicsQuality: 'mixed', spreadVsFundingQuality: 'neutral', concentrationRisk: 'medium', delinquencySignal: 'low', sourceConfidence: 0.5, sourceNotes: [] },
      sourceRecords: row.source_trace ?? [],
      marketMapPeers: row.estimated_payload?.marketMapPeers ?? [],
      activities: row.estimated_payload?.activities ?? [],
    }));
  }

  async listSearchProfiles() {
    const client = this.ensureClient();
    const data = await client.select('search_profiles', { select: '*' });
    return (data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      segment: row.segment,
      subsegment: row.subsegment,
      companyType: row.company_type,
      geography: row.geography,
      creditProduct: row.credit_product,
      receivables: row.profile_payload?.receivables ?? [],
      targetStructure: row.target_structure,
      minimumSignalIntensity: row.minimum_signal_intensity,
      minimumConfidence: Number(row.minimum_confidence),
      timeWindowDays: row.time_window_days,
      status: row.status,
      profilePayload: row.profile_payload ?? {},
    }));
  }

  async listSources() {
    const client = this.ensureClient();
    const data = await client.select('source_catalog', { select: '*' });
    return (data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      sourceType: row.source_type,
      category: row.category,
      status: row.status,
      health: row.health ?? 'healthy',
      authRequirement: row.auth_requirement ?? undefined,
      metadata: row.metadata ?? {},
      rateLimitNotes: row.rate_limit_notes ?? undefined,
    }));
  }

  async listPatternCatalog() {
    const client = this.ensureClient();
    const data = await client.select('pattern_catalog', { select: '*' });
    return (data ?? []).map((row: any) => ({
      id: row.id,
      patternName: row.pattern_name,
      patternFamily: row.pattern_family,
      description: row.description,
      explicitFeatures: row.explicit_features ?? [],
      latentFeatures: row.latent_features ?? [],
      qualificationImpact: row.default_qualification_impact ?? 0,
      leadImpact: row.default_lead_score_impact ?? 0,
      rankingImpact: row.default_ranking_impact ?? 0,
    }));
  }

  async listMonitoringOutputs() {
    const client = this.ensureClient();
    const data = await client.select('monitoring_outputs', { select: '*', orderBy: { column: 'created_at', ascending: false } });
    return (data ?? []).map((row: any) => ({
      id: row.id,
      companyId: row.company_id,
      sourceId: row.source_id,
      title: row.output_payload?.title ?? row.source_id,
      summary: row.output_payload?.summary ?? '',
      collectedAt: row.created_at,
      confidenceScore: Number(row.confidence_score ?? 0),
      connectorStatus: row.connector_status ?? 'partial',
      normalizedPayload: row.normalized_payload ?? row.output_payload ?? {},
    }));
  }

  async saveMonitoringOutputs(outputs: MonitoringOutput[]) {
    const client = this.ensureClient();
    await client.upsert('monitoring_outputs', outputs.map((output) => ({
      id: output.id,
      company_id: output.companyId,
      source_id: output.sourceId,
      output_payload: { title: output.title, summary: output.summary },
      confidence_score: output.confidenceScore,
      connector_status: output.connectorStatus,
      normalized_payload: output.normalizedPayload,
      observed_vs_inferred: 'observed',
    })));
  }

  async saveQualificationSnapshots(items: QualificationSnapshot[]) {
    const client = this.ensureClient();
    await client.upsert('qualification_snapshots', items.map((item: any) => ({ ...item, company_id: item.companyId, companyId: undefined })));
  }

  async saveCompanyPatterns(items: CompanyPattern[]) {
    const client = this.ensureClient();
    await client.upsert('company_patterns', items.map((item) => ({
      id: item.id,
      company_id: item.companyId,
      pattern_id: item.patternId,
      rationale: item.rationale,
      confidence_score: item.confidenceScore,
      qualification_impact: item.qualificationImpact,
      lead_score_impact: item.leadScoreImpact,
      ranking_impact: item.rankingImpact,
      thesis_impact: item.thesisImpact,
      evidence_payload: item.evidencePayload,
    })));
  }

  async saveScoreSnapshots(items: ScoreSnapshot[]) {
    const client = this.ensureClient();
    await client.upsert('score_snapshots', items.map((item) => ({
      company_id: item.companyId,
      score_type: item.scoreType,
      score_value: item.scoreValue,
      rationale: item.rationale,
      version: item.version,
      created_at: item.createdAt,
    })));
  }

  async saveLeadScoreSnapshots(items: LeadScoreSnapshot[]) {
    const client = this.ensureClient();
    await client.upsert('lead_score_snapshots', items.map((item) => ({
      company_id: item.companyId,
      lead_score: item.leadScore,
      bucket: item.bucket,
      rationale: item.rationale,
      next_action: item.nextAction,
      source_confidence: item.sourceConfidence,
      trigger_strength: item.triggerStrength,
      pattern_score: item.patternScore,
      created_at: item.createdAt,
    })));
  }

  async seedBaseData() {
    const client = this.ensureClient();
    await client.upsert('source_catalog', sourceCatalogSeeds.map((item) => ({
      id: item.id,
      name: item.name,
      source_type: item.sourceType,
      category: item.category,
      status: item.status,
      health: item.health,
      auth_requirement: item.authRequirement,
      metadata: item.metadata,
      rate_limit_notes: item.rateLimitNotes,
    })));
    await client.upsert('pattern_catalog', patternCatalogSeeds.map((item) => ({
      id: item.id,
      pattern_name: item.patternName,
      pattern_family: item.patternFamily,
      description: item.description,
      explicit_features: item.explicitFeatures,
      latent_features: item.latentFeatures,
      default_qualification_impact: item.qualificationImpact,
      default_lead_score_impact: item.leadImpact,
      default_ranking_impact: item.rankingImpact,
    })));
    await client.upsert('search_profiles', searchProfileSeeds.map((item) => ({
      id: item.id,
      name: item.name,
      segment: item.segment,
      subsegment: item.subsegment,
      company_type: item.companyType,
      geography: item.geography,
      credit_product: item.creditProduct,
      target_structure: item.targetStructure,
      minimum_signal_intensity: item.minimumSignalIntensity,
      minimum_confidence: item.minimumConfidence,
      time_window_days: item.timeWindowDays,
      status: item.status,
      profile_payload: item.profilePayload,
    })));
    await client.upsert('companies', companySeeds.map((item) => ({
      id: item.id,
      legal_name: item.legalName,
      trade_name: item.tradeName,
      cnpj: item.cnpj,
      segment: item.segment,
      subsegment: item.subsegment,
      geography: item.geography,
      company_type: item.companyType,
      stage: item.stage,
      website: item.website,
      current_funding_structure: item.currentFundingStructure,
      observed_payload: {
        credit_product: item.creditProduct,
        receivables: item.receivables,
        description: item.description,
        signals: item.signals,
        monitoring: item.monitoring,
      },
      inferred_payload: { enrichment: item.enrichment },
      estimated_payload: { marketMapPeers: item.marketMapPeers, activities: item.activities },
      source_trace: item.sourceRecords,
    })));
  }
}

export const createPlatformRepository = (mode: 'memory' | 'supabase'): PlatformRepository => (mode === 'supabase' ? new SupabasePlatformRepository() : new MemoryPlatformRepository());
