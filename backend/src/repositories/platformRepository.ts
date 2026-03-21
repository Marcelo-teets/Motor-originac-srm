import { additionalCompanySeeds } from '../data/additionalCompanySeeds.js';
import { companySeeds, patternCatalogSeeds, searchProfileSeeds, sourceCatalogSeeds } from '../data/platformSeeds.js';
import { getSupabaseClient } from '../lib/supabase.js';
import type {
  CompanyPattern,
  CompanySeed,
  CompanySignal,
  EnrichmentRecord,
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
  listCompanySignals(): Promise<CompanySignal[]>;
  listEnrichments(): Promise<EnrichmentRecord[]>;
  listQualificationSnapshots(): Promise<QualificationSnapshot[]>;
  listCompanyPatterns(): Promise<CompanyPattern[]>;
  listScoreSnapshots(): Promise<ScoreSnapshot[]>;
  listLeadScoreSnapshots(): Promise<LeadScoreSnapshot[]>;
  saveMonitoringOutputs(outputs: MonitoringOutput[]): Promise<void>;
  saveCompanySignals(items: CompanySignal[]): Promise<void>;
  saveEnrichments(items: EnrichmentRecord[]): Promise<void>;
  saveQualificationSnapshots(items: QualificationSnapshot[]): Promise<void>;
  saveCompanyPatterns(items: CompanyPattern[]): Promise<void>;
  saveScoreSnapshots(items: ScoreSnapshot[]): Promise<void>;
  saveLeadScoreSnapshots(items: LeadScoreSnapshot[]): Promise<void>;
  seedBaseData(): Promise<void>;
}

const seededCompanies = [...companySeeds, ...additionalCompanySeeds];

const defaultMonitoring = {
  status: 'queued',
  lastRunAt: '',
  outputs24h: 0,
  triggers24h: 0,
  websiteChanges: [],
  feedHighlights: [],
};

class MemoryPlatformRepository implements PlatformRepository {
  private companies = structuredClone(seededCompanies);
  private searchProfiles = structuredClone(searchProfileSeeds);
  private sources = structuredClone(sourceCatalogSeeds);
  private patternCatalog = structuredClone(patternCatalogSeeds);
  private monitoringOutputs: MonitoringOutput[] = [];
  private companySignals: CompanySignal[] = this.companies.flatMap((company) => company.signals.map((signal, index) => ({
    id: `${company.id}_seed_signal_${index + 1}`,
    companyId: company.id,
    sourceId: signal.source,
    signalType: signal.type,
    signalStrength: signal.strength,
    confidenceScore: signal.confidence,
    evidencePayload: { note: signal.note, source: signal.source },
    observedVsInferred: 'observed',
    createdAt: company.monitoring.lastRunAt,
  })));
  private enrichments: EnrichmentRecord[] = this.companies.map((company) => ({
    id: `${company.id}_seed_enrichment`,
    companyId: company.id,
    enrichmentType: 'company_profile',
    provider: 'seed',
    payload: company.enrichment,
    observedVsInferred: 'inferred',
    createdAt: company.monitoring.lastRunAt,
  }));
  private qualificationSnapshots: QualificationSnapshot[] = [];
  private companyPatterns: CompanyPattern[] = [];
  private scoreSnapshots: ScoreSnapshot[] = [];
  private leadScoreSnapshots: LeadScoreSnapshot[] = [];

  async listCompanies() { return structuredClone(this.companies); }
  async listSearchProfiles() { return structuredClone(this.searchProfiles); }
  async listSources() { return structuredClone(this.sources); }
  async listPatternCatalog() { return structuredClone(this.patternCatalog); }
  async listMonitoringOutputs() { return structuredClone(this.monitoringOutputs); }
  async listCompanySignals() { return structuredClone(this.companySignals); }
  async listEnrichments() { return structuredClone(this.enrichments); }
  async listQualificationSnapshots() { return structuredClone(this.qualificationSnapshots); }
  async listCompanyPatterns() { return structuredClone(this.companyPatterns); }
  async listScoreSnapshots() { return structuredClone(this.scoreSnapshots); }
  async listLeadScoreSnapshots() { return structuredClone(this.leadScoreSnapshots); }

  async saveMonitoringOutputs(outputs: MonitoringOutput[]) {
    const ids = new Set(outputs.map((item) => item.id));
    this.monitoringOutputs = [...this.monitoringOutputs.filter((item) => !ids.has(item.id)), ...outputs];
  }

  async saveCompanySignals(items: CompanySignal[]) {
    const ids = new Set(items.map((item) => item.id));
    this.companySignals = [...this.companySignals.filter((item) => !ids.has(item.id)), ...items];
  }

  async saveEnrichments(items: EnrichmentRecord[]) {
    const ids = new Set(items.map((item) => item.id));
    this.enrichments = [...this.enrichments.filter((item) => !ids.has(item.id)), ...items];
  }

  async saveQualificationSnapshots(items: QualificationSnapshot[]) {
    this.qualificationSnapshots.push(...items);
  }

  async saveCompanyPatterns(items: CompanyPattern[]) {
    const ids = new Set(items.map((item) => item.id));
    this.companyPatterns = [...this.companyPatterns.filter((item) => !ids.has(item.id)), ...items];
  }

  async saveScoreSnapshots(items: ScoreSnapshot[]) {
    this.scoreSnapshots.push(...items);
  }

  async saveLeadScoreSnapshots(items: LeadScoreSnapshot[]) {
    this.leadScoreSnapshots.push(...items);
  }

  async seedBaseData() {
    return;
  }
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
      monitoring: row.observed_payload?.monitoring ?? defaultMonitoring,
      enrichment: row.inferred_payload?.enrichment ?? seededCompanies.find((item) => item.id === row.id)?.enrichment ?? {
        governanceMaturity: 'medium', underwritingMaturity: 'medium', operationalMaturity: 'medium', riskModelMaturity: 'medium',
        unitEconomicsQuality: 'mixed', spreadVsFundingQuality: 'neutral', concentrationRisk: 'medium', delinquencySignal: 'low', sourceConfidence: 0.5, sourceNotes: [],
      },
      sourceRecords: row.source_trace ?? [],
      marketMapPeers: row.estimated_payload?.marketMapPeers ?? [],
      activities: row.estimated_payload?.activities ?? [],
    } satisfies CompanySeed));
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

  async listCompanySignals() {
    const client = this.ensureClient();
    const data = await client.select('company_signals', { select: '*', orderBy: { column: 'created_at', ascending: false } });
    return (data ?? []).map((row: any) => ({
      id: row.id,
      companyId: row.company_id,
      sourceId: row.source_id,
      signalType: row.signal_type,
      signalStrength: Number(row.signal_strength ?? 0),
      confidenceScore: Number(row.confidence_score ?? 0),
      evidencePayload: row.evidence_payload ?? {},
      observedVsInferred: row.observed_vs_inferred ?? 'observed',
      createdAt: row.created_at,
    }));
  }

  async listEnrichments() {
    const client = this.ensureClient();
    const data = await client.select('enrichments', { select: '*', orderBy: { column: 'created_at', ascending: false } });
    return (data ?? []).map((row: any) => ({
      id: row.id,
      companyId: row.company_id,
      enrichmentType: row.enrichment_type,
      provider: row.provider,
      payload: row.payload ?? {},
      observedVsInferred: row.observed_vs_inferred ?? 'inferred',
      createdAt: row.created_at,
    }));
  }

  async listQualificationSnapshots() {
    const client = this.ensureClient();
    const data = await client.select('qualification_snapshots', { select: '*', orderBy: { column: 'created_at', ascending: false } });
    return (data ?? []).map((row: any) => ({ ...row, companyId: row.company_id, pattern_summary: row.pattern_summary ?? [] }));
  }

  async listCompanyPatterns() {
    const client = this.ensureClient();
    const data = await client.select('company_patterns', { select: '*', orderBy: { column: 'created_at', ascending: false } });
    const catalog = await this.listPatternCatalog();
    const nameById = Object.fromEntries(catalog.map((item: PatternCatalogEntry) => [item.id, item.patternName]));
    return (data ?? []).map((row: any) => ({
      id: row.id,
      companyId: row.company_id,
      patternId: row.pattern_id,
      patternName: nameById[row.pattern_id] ?? row.pattern_id,
      rationale: row.rationale ?? '',
      confidenceScore: Number(row.confidence_score ?? 0),
      qualificationImpact: Number(row.qualification_impact ?? 0),
      leadScoreImpact: Number(row.lead_score_impact ?? 0),
      rankingImpact: Number(row.ranking_impact ?? 0),
      thesisImpact: row.thesis_impact ?? '',
      evidencePayload: row.evidence_payload ?? {},
    }));
  }

  async listScoreSnapshots() {
    const client = this.ensureClient();
    const data = await client.select('score_snapshots', { select: '*', orderBy: { column: 'created_at', ascending: false } });
    return (data ?? []).map((row: any) => ({
      companyId: row.company_id,
      scoreType: row.score_type,
      scoreValue: Number(row.score_value ?? 0),
      rationale: row.rationale ?? '',
      version: Number(row.version ?? 1),
      createdAt: row.created_at,
    }));
  }

  async listLeadScoreSnapshots() {
    const client = this.ensureClient();
    const data = await client.select('lead_score_snapshots', { select: '*', orderBy: { column: 'created_at', ascending: false } });
    return (data ?? []).map((row: any) => ({
      companyId: row.company_id,
      leadScore: Number(row.lead_score ?? 0),
      bucket: row.bucket,
      rationale: row.rationale ?? '',
      nextAction: row.next_action ?? 'Executar análise comercial',
      sourceConfidence: Number(row.source_confidence ?? 0),
      triggerStrength: Number(row.trigger_strength ?? 0),
      patternScore: Number(row.pattern_score ?? 0),
      createdAt: row.created_at,
    }));
  }

  async saveMonitoringOutputs(outputs: MonitoringOutput[]) {
    const client = this.ensureClient();
    await client.upsert('monitoring_outputs', outputs.map((output) => ({
      id: output.id,
      company_id: output.companyId,
      source_id: output.sourceId,
      output_payload: { title: output.title, summary: output.summary },
      normalized_payload: output.normalizedPayload,
      confidence_score: output.confidenceScore,
      connector_status: output.connectorStatus,
      observed_vs_inferred: 'observed',
      created_at: output.collectedAt,
    })));
  }

  async saveCompanySignals(items: CompanySignal[]) {
    const client = this.ensureClient();
    await client.upsert('company_signals', items.map((item) => ({
      id: item.id,
      company_id: item.companyId,
      source_id: item.sourceId,
      signal_type: item.signalType,
      signal_strength: item.signalStrength,
      confidence_score: item.confidenceScore,
      evidence_payload: item.evidencePayload,
      observed_vs_inferred: item.observedVsInferred,
      created_at: item.createdAt,
    })));
  }

  async saveEnrichments(items: EnrichmentRecord[]) {
    const client = this.ensureClient();
    await client.upsert('enrichments', items.map((item) => ({
      id: item.id,
      company_id: item.companyId,
      enrichment_type: item.enrichmentType,
      provider: item.provider,
      payload: item.payload,
      observed_vs_inferred: item.observedVsInferred,
      created_at: item.createdAt,
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
      profile_payload: { ...item.profilePayload, receivables: item.receivables },
    })));
    await client.upsert('companies', seededCompanies.map((item) => ({
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
        description: item.description,
        credit_product: item.creditProduct,
        receivables: item.receivables,
        monitoring: item.monitoring,
        signals: item.signals,
      },
      inferred_payload: { enrichment: item.enrichment },
      estimated_payload: { marketMapPeers: item.marketMapPeers, activities: item.activities },
      source_trace: item.sourceRecords,
    })));
    await this.saveCompanySignals(seededCompanies.flatMap((company) => company.signals.map((signal, index) => ({
      id: `${company.id}_seed_signal_${index + 1}`,
      companyId: company.id,
      sourceId: signal.source,
      signalType: signal.type,
      signalStrength: signal.strength,
      confidenceScore: signal.confidence,
      evidencePayload: { note: signal.note, source: signal.source },
      observedVsInferred: 'observed',
      createdAt: company.monitoring.lastRunAt,
    }))));
    await this.saveEnrichments(seededCompanies.map((company) => ({
      id: `${company.id}_seed_enrichment`,
      companyId: company.id,
      enrichmentType: 'company_profile',
      provider: 'seed',
      payload: company.enrichment,
      observedVsInferred: 'inferred',
      createdAt: company.monitoring.lastRunAt,
    })));
  }
}

export const createPlatformRepository = (mode: 'memory' | 'supabase'): PlatformRepository => (mode === 'supabase' ? new SupabasePlatformRepository() : new MemoryPlatformRepository());
