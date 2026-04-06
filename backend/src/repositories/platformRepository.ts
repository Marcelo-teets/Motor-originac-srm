import { additionalCompanySeeds } from '../data/additionalCompanySeeds.js';
import { companySeeds, patternCatalogSeeds, searchProfileFilterSeeds, searchProfileSeeds, sourceCatalogSeeds } from '../data/platformSeeds.js';
import { env } from '../lib/env.js';
import { getSupabaseClient } from '../lib/supabase.js';
import type {
  ActivityRecord,
  CompanyPattern,
  CompanySeed,
  CompanySignal,
  EnrichmentRecord,
  LeadScoreSnapshot,
  MonitoringOutput,
  PatternCatalogEntry,
  PipelineRow,
  PipelineStage,
  QualificationSnapshot,
  ScoreSnapshot,
  SearchProfile,
  SearchProfileFilter,
  SourceCatalogEntry,
  Owner,
  ActivityStatus,
  TaskRecord,
} from '../types/platform.js';

export interface PlatformRepository {
  listCompanies(): Promise<CompanySeed[]>;
  listSearchProfiles(): Promise<SearchProfile[]>;
  listSearchProfileFilters(): Promise<SearchProfileFilter[]>;
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
  saveSearchProfile(profile: SearchProfile): Promise<SearchProfile>;
  listPipelineRows(): Promise<PipelineRow[]>;
  getPipelineByCompany(companyId: string): Promise<PipelineRow | null>;
  savePipelineRow(row: Omit<PipelineRow, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<PipelineRow>;
  movePipelineStage(companyId: string, stage: PipelineStage): Promise<PipelineRow | null>;
  updateNextAction(companyId: string, nextAction: string): Promise<PipelineRow | null>;
  listActivities(companyId?: string): Promise<ActivityRecord[]>;
  saveActivity(activity: Omit<ActivityRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<ActivityRecord>;
  listTasks(companyId?: string): Promise<TaskRecord[]>;
  saveTask(task: Omit<TaskRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<TaskRecord>;
  updateTask(taskId: string, updates: Partial<Pick<TaskRecord, 'title' | 'description' | 'owner' | 'status' | 'dueDate'>>): Promise<TaskRecord | null>;
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

const defaultEnrichment = {
  governanceMaturity: 'medium',
  underwritingMaturity: 'medium',
  operationalMaturity: 'medium',
  riskModelMaturity: 'medium',
  unitEconomicsQuality: 'mixed',
  spreadVsFundingQuality: 'neutral',
  concentrationRisk: 'medium',
  delinquencySignal: 'low',
  sourceConfidence: 0.5,
  sourceNotes: [],
} as const;

const stableFilterTimestamp = '2026-03-21T09:00:00Z';

const profileToFilters = (profile: SearchProfile): SearchProfileFilter[] => ([
  { id: `${profile.id}_segment`, profileId: profile.id, filterKey: 'segment', filterValue: profile.segment, createdAt: stableFilterTimestamp },
  { id: `${profile.id}_subsegment`, profileId: profile.id, filterKey: 'subsegment', filterValue: profile.subsegment, createdAt: stableFilterTimestamp },
  { id: `${profile.id}_company_type`, profileId: profile.id, filterKey: 'companyType', filterValue: profile.companyType, createdAt: stableFilterTimestamp },
  { id: `${profile.id}_geography`, profileId: profile.id, filterKey: 'geography', filterValue: profile.geography, createdAt: stableFilterTimestamp },
  { id: `${profile.id}_credit_product`, profileId: profile.id, filterKey: 'creditProduct', filterValue: profile.creditProduct, createdAt: stableFilterTimestamp },
  { id: `${profile.id}_receivables`, profileId: profile.id, filterKey: 'receivables', filterValue: profile.receivables, createdAt: stableFilterTimestamp },
  { id: `${profile.id}_target_structure`, profileId: profile.id, filterKey: 'targetStructure', filterValue: profile.targetStructure, createdAt: stableFilterTimestamp },
  { id: `${profile.id}_minimum_signal_intensity`, profileId: profile.id, filterKey: 'minimumSignalIntensity', filterValue: profile.minimumSignalIntensity, createdAt: stableFilterTimestamp },
  { id: `${profile.id}_minimum_confidence`, profileId: profile.id, filterKey: 'minimumConfidence', filterValue: profile.minimumConfidence, createdAt: stableFilterTimestamp },
  { id: `${profile.id}_time_window_days`, profileId: profile.id, filterKey: 'timeWindowDays', filterValue: profile.timeWindowDays, createdAt: stableFilterTimestamp },
]);

const mergeProfilePayload = (profile: SearchProfile, filters: SearchProfileFilter[]) => ({
  ...profile.profilePayload,
  receivables: profile.receivables,
  filters: filters.reduce<Record<string, unknown>>((acc, filter) => {
    acc[filter.filterKey] = filter.filterValue;
    return acc;
  }, {}),
});
const asPipelineStage = (value: string): PipelineStage => {
  const allowed: PipelineStage[] = ['Identified', 'Qualified', 'Approach', 'Structuring', 'Mandated', 'ClosedWon', 'ClosedLost', 'Recycled'];
  return allowed.includes(value as PipelineStage) ? value as PipelineStage : 'Identified';
};
const asOwner = (value: string): Owner => {
  const allowed: Owner[] = ['Origination', 'Coverage', 'Analytics', 'Intelligence', 'Credit', 'Unknown'];
  return allowed.includes(value as Owner) ? value as Owner : 'Unknown';
};
const asActivityStatus = (value: string): ActivityStatus => {
  const allowed: ActivityStatus[] = ['open', 'done', 'cancelled'];
  return allowed.includes(value as ActivityStatus) ? value as ActivityStatus : 'open';
};

class MemoryPlatformRepository implements PlatformRepository {
  private companies = structuredClone(seededCompanies);
  private searchProfiles = structuredClone(searchProfileSeeds);
  private searchProfileFilters: SearchProfileFilter[] = structuredClone(searchProfileFilterSeeds as SearchProfileFilter[]);
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
  private pipelineRows: PipelineRow[] = this.companies.map((company, index) => ({
    id: `pipeline_${company.id}`,
    companyId: company.id,
    stage: asPipelineStage(['Identified', 'Qualified', 'Approach', 'Structuring'][index % 4]),
    owner: asOwner(company.activities[0]?.owner ?? 'Origination'),
    nextAction: company.activities[0]?.title ?? 'Executar abordagem comercial',
    createdAt: company.monitoring.lastRunAt,
    updatedAt: company.monitoring.lastRunAt,
  }));
  private activities: ActivityRecord[] = this.companies.flatMap((company) => company.activities.map((activity, index) => ({
    id: `${company.id}_activity_${index + 1}`,
    companyId: company.id,
    type: 'follow_up',
    title: activity.title,
    description: activity.title,
    owner: asOwner(activity.owner),
    status: asActivityStatus(activity.status),
    dueDate: activity.dueDate,
    createdAt: company.monitoring.lastRunAt,
    updatedAt: company.monitoring.lastRunAt,
  })));
  private tasks: TaskRecord[] = [];

  async listCompanies() { return structuredClone(this.companies); }
  async listSearchProfiles() { return structuredClone(this.searchProfiles); }
  async listSearchProfileFilters() { return structuredClone(this.searchProfileFilters); }
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

  async saveSearchProfile(profile: SearchProfile) {
    const existingIndex = this.searchProfiles.findIndex((item) => item.id === profile.id);
    if (existingIndex >= 0) this.searchProfiles[existingIndex] = structuredClone(profile);
    else this.searchProfiles.unshift(structuredClone(profile));

    const filters = profileToFilters(profile);
    this.searchProfileFilters = [
      ...this.searchProfileFilters.filter((item) => item.profileId !== profile.id),
      ...filters,
    ];

    return structuredClone(profile);
  }

  async listPipelineRows() { return structuredClone(this.pipelineRows); }

  async getPipelineByCompany(companyId: string) {
    return structuredClone(this.pipelineRows.find((item) => item.companyId === companyId) ?? null);
  }

  async savePipelineRow(row: Omit<PipelineRow, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
    const now = new Date().toISOString();
    const existing = this.pipelineRows.find((item) => item.companyId === row.companyId);
    const saved: PipelineRow = {
      id: row.id ?? existing?.id ?? `pipeline_${row.companyId}`,
      companyId: row.companyId,
      stage: row.stage,
      owner: row.owner,
      nextAction: row.nextAction,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.pipelineRows = [...this.pipelineRows.filter((item) => item.companyId !== row.companyId), saved];
    return structuredClone(saved);
  }

  async movePipelineStage(companyId: string, stage: PipelineStage) {
    const current = await this.getPipelineByCompany(companyId);
    if (!current) return null;
    return this.savePipelineRow({ ...current, stage });
  }

  async updateNextAction(companyId: string, nextAction: string) {
    const current = await this.getPipelineByCompany(companyId);
    if (!current) return null;
    return this.savePipelineRow({ ...current, nextAction });
  }

  async listActivities(companyId?: string) {
    return structuredClone(companyId ? this.activities.filter((item) => item.companyId === companyId) : this.activities);
  }

  async saveActivity(activity: Omit<ActivityRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
    const now = new Date().toISOString();
    const saved: ActivityRecord = { ...activity, id: activity.id ?? crypto.randomUUID(), createdAt: now, updatedAt: now };
    this.activities.unshift(saved);
    return structuredClone(saved);
  }

  async listTasks(companyId?: string) {
    return structuredClone(companyId ? this.tasks.filter((item) => item.companyId === companyId) : this.tasks);
  }

  async saveTask(task: Omit<TaskRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
    const now = new Date().toISOString();
    const saved: TaskRecord = { ...task, id: task.id ?? crypto.randomUUID(), createdAt: now, updatedAt: now };
    this.tasks.unshift(saved);
    return structuredClone(saved);
  }

  async updateTask(taskId: string, updates: Partial<Pick<TaskRecord, 'title' | 'description' | 'owner' | 'status' | 'dueDate'>>) {
    const index = this.tasks.findIndex((item) => item.id === taskId);
    if (index < 0) return null;
    const updated: TaskRecord = { ...this.tasks[index], ...updates, updatedAt: new Date().toISOString() };
    this.tasks[index] = updated;
    return structuredClone(updated);
  }

  async seedBaseData() {
    return;
  }
}

class SupabasePlatformRepository implements PlatformRepository {
  private readonly client = getSupabaseClient();
  private readonly fallback = new MemoryPlatformRepository();

  private ensureClient() {
    if (!this.client) throw new Error('Supabase client not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/ANON key.');
    return this.client;
  }

  private async readWithFallback<T>(loader: () => Promise<T>, fallback: () => Promise<T>, shouldFallback?: (result: T) => boolean) {
    try {
      const result = await loader();
      if (shouldFallback?.(result)) return fallback();
      return result;
    } catch {
      return fallback();
    }
  }

  private async writeWithFallback(action: () => Promise<void>, fallback: () => Promise<void>) {
    try {
      await action();
    } catch {
      await fallback();
    }
  }

  private shouldUseFallbackForRuntime() {
    return !this.client;
  }

  async listCompanies() {
    return this.readWithFallback(async () => {
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
        enrichment: row.inferred_payload?.enrichment ?? seededCompanies.find((item) => item.id === row.id)?.enrichment ?? defaultEnrichment,
        sourceRecords: row.source_trace ?? [],
        marketMapPeers: row.estimated_payload?.marketMapPeers ?? [],
        activities: row.estimated_payload?.activities ?? [],
      } satisfies CompanySeed));
    }, () => this.fallback.listCompanies(), (result) => Array.isArray(result) && result.length === 0);
  }

  async listSearchProfileFilters() {
    return this.readWithFallback(async () => {
      const client = this.ensureClient();
      const data = await client.select('search_profile_filters', { select: '*', orderBy: { column: 'created_at', ascending: true } });
      return (data ?? []).map((row: any) => ({
        id: row.id,
        profileId: row.profile_id,
        filterKey: row.filter_key,
        filterValue: row.filter_value,
        createdAt: row.created_at,
      } satisfies SearchProfileFilter));
    }, () => this.fallback.listSearchProfileFilters());
  }

  async listSearchProfiles() {
    return this.readWithFallback(async () => {
      const client = this.ensureClient();
      const [profiles, filters] = await Promise.all([
        client.select('search_profiles', { select: '*', orderBy: { column: 'created_at', ascending: false } }),
        this.listSearchProfileFilters(),
      ]);
      return (profiles ?? []).map((row: any) => {
        const profileFilters = filters.filter((filter: SearchProfileFilter) => filter.profileId === row.id);
        return {
          id: row.id,
          name: row.name,
          segment: row.segment,
          subsegment: row.subsegment,
          companyType: row.company_type,
          geography: row.geography,
          creditProduct: row.credit_product,
          receivables: row.profile_payload?.receivables ?? ((profileFilters.find((item: SearchProfileFilter) => item.filterKey === 'receivables')?.filterValue as string[]) ?? []),
          targetStructure: row.target_structure,
          minimumSignalIntensity: Number(row.minimum_signal_intensity ?? profileFilters.find((item: SearchProfileFilter) => item.filterKey === 'minimumSignalIntensity')?.filterValue ?? 50),
          minimumConfidence: Number(row.minimum_confidence ?? profileFilters.find((item: SearchProfileFilter) => item.filterKey === 'minimumConfidence')?.filterValue ?? 0.6),
          timeWindowDays: Number(row.time_window_days ?? profileFilters.find((item: SearchProfileFilter) => item.filterKey === 'timeWindowDays')?.filterValue ?? 90),
          status: row.status,
          profilePayload: {
            ...(row.profile_payload ?? {}),
            filters: profileFilters.reduce((acc: Record<string, unknown>, filter: SearchProfileFilter) => {
              acc[filter.filterKey] = filter.filterValue;
              return acc;
            }, {}),
          },
        } satisfies SearchProfile;
      });
    }, () => this.fallback.listSearchProfiles(), (result) => Array.isArray(result) && result.length === 0);
  }

  async listSources() {
    return this.readWithFallback(async () => {
      const client = this.ensureClient();
      const data = await client.select('source_catalog', { select: '*', orderBy: { column: 'name', ascending: true } });
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
      } satisfies SourceCatalogEntry));
    }, () => this.fallback.listSources(), (result) => Array.isArray(result) && result.length === 0);
  }

  async listPatternCatalog() {
    return this.readWithFallback(async () => {
      const client = this.ensureClient();
      const data = await client.select('pattern_catalog', { select: '*', orderBy: { column: 'created_at', ascending: true } });
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
      } satisfies PatternCatalogEntry));
    }, () => this.fallback.listPatternCatalog(), (result) => Array.isArray(result) && result.length === 0);
  }

  async listMonitoringOutputs() {
    return this.readWithFallback(async () => {
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
      } satisfies MonitoringOutput));
    }, () => this.fallback.listMonitoringOutputs());
  }

  async listCompanySignals() {
    return this.readWithFallback(async () => {
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
      } satisfies CompanySignal));
    }, () => this.fallback.listCompanySignals());
  }

  async listEnrichments() {
    return this.readWithFallback(async () => {
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
      } satisfies EnrichmentRecord));
    }, () => this.fallback.listEnrichments());
  }

  async listQualificationSnapshots() {
    return this.readWithFallback(async () => {
      const client = this.ensureClient();
      const data = await client.select('qualification_snapshots', { select: '*', orderBy: { column: 'created_at', ascending: false } });
      return (data ?? []).map((row: any) => ({ ...row, companyId: row.company_id, pattern_summary: row.pattern_summary ?? [] } satisfies QualificationSnapshot));
    }, () => this.fallback.listQualificationSnapshots());
  }

  async listCompanyPatterns() {
    return this.readWithFallback(async () => {
      const client = this.ensureClient();
      const [data, catalog] = await Promise.all([
        client.select('company_patterns', { select: '*', orderBy: { column: 'created_at', ascending: false } }),
        this.listPatternCatalog(),
      ]);
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
      } satisfies CompanyPattern));
    }, () => this.fallback.listCompanyPatterns());
  }

  async listScoreSnapshots() {
    return this.readWithFallback(async () => {
      const client = this.ensureClient();
      const data = await client.select('score_snapshots', { select: '*', orderBy: { column: 'created_at', ascending: false } });
      return (data ?? []).map((row: any) => ({
        companyId: row.company_id,
        scoreType: row.score_type,
        scoreValue: Number(row.score_value ?? 0),
        rationale: row.rationale ?? '',
        version: Number(row.version ?? 1),
        createdAt: row.created_at,
      } satisfies ScoreSnapshot));
    }, () => this.fallback.listScoreSnapshots());
  }

  async listLeadScoreSnapshots() {
    return this.readWithFallback(async () => {
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
      } satisfies LeadScoreSnapshot));
    }, () => this.fallback.listLeadScoreSnapshots());
  }

  async saveMonitoringOutputs(outputs: MonitoringOutput[]) {
    await this.writeWithFallback(async () => {
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
      })), 'id');
    }, () => this.fallback.saveMonitoringOutputs(outputs));
  }

  async saveCompanySignals(items: CompanySignal[]) {
    await this.writeWithFallback(async () => {
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
      })), 'id');
    }, () => this.fallback.saveCompanySignals(items));
  }

  async saveEnrichments(items: EnrichmentRecord[]) {
    await this.writeWithFallback(async () => {
      const client = this.ensureClient();
      await client.upsert('enrichments', items.map((item) => ({
        id: item.id,
        company_id: item.companyId,
        enrichment_type: item.enrichmentType,
        provider: item.provider,
        payload: item.payload,
        observed_vs_inferred: item.observedVsInferred,
        created_at: item.createdAt,
      })), 'id');
    }, () => this.fallback.saveEnrichments(items));
  }

  async saveQualificationSnapshots(items: QualificationSnapshot[]) {
    await this.writeWithFallback(async () => {
      const client = this.ensureClient();
      await client.insert('qualification_snapshots', items.map((item: any) => {
        const { companyId, ...rest } = item;
        return { ...rest, company_id: companyId };
      }));
    }, () => this.fallback.saveQualificationSnapshots(items));
  }

  async saveCompanyPatterns(items: CompanyPattern[]) {
    await this.writeWithFallback(async () => {
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
      })), 'id');
    }, () => this.fallback.saveCompanyPatterns(items));
  }

  async saveScoreSnapshots(items: ScoreSnapshot[]) {
    await this.writeWithFallback(async () => {
      const client = this.ensureClient();
      await client.insert('score_snapshots', items.map((item) => ({
        company_id: item.companyId,
        score_type: item.scoreType,
        score_value: item.scoreValue,
        rationale: item.rationale,
        version: item.version,
        created_at: item.createdAt,
      })));
    }, () => this.fallback.saveScoreSnapshots(items));
  }

  async saveLeadScoreSnapshots(items: LeadScoreSnapshot[]) {
    await this.writeWithFallback(async () => {
      const client = this.ensureClient();
      await client.insert('lead_score_snapshots', items.map((item) => ({
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
    }, () => this.fallback.saveLeadScoreSnapshots(items));
  }

  async saveSearchProfile(profile: SearchProfile) {
    await this.writeWithFallback(async () => {
      const client = this.ensureClient();
      const filters = profileToFilters(profile);
      await client.upsert('search_profiles', [{
        id: profile.id,
        name: profile.name,
        segment: profile.segment,
        subsegment: profile.subsegment,
        company_type: profile.companyType,
        geography: profile.geography,
        credit_product: profile.creditProduct,
        target_structure: profile.targetStructure,
        minimum_signal_intensity: profile.minimumSignalIntensity,
        minimum_confidence: profile.minimumConfidence,
        time_window_days: profile.timeWindowDays,
        status: profile.status,
        profile_payload: mergeProfilePayload(profile, filters),
      }], 'id');
      await client.delete('search_profile_filters', [{ column: 'profile_id', operator: 'eq', value: profile.id }]);
      await client.insert('search_profile_filters', filters.map((filter) => ({
        profile_id: filter.profileId,
        filter_key: filter.filterKey,
        filter_value: filter.filterValue,
        created_at: filter.createdAt,
      })));
    }, async () => {
      await this.fallback.saveSearchProfile(profile);
    });
    return profile;
  }

  async listPipelineRows() {
    if (this.shouldUseFallbackForRuntime()) return this.fallback.listPipelineRows();
    const client = this.ensureClient();
    const data = await client.select('pipeline', { select: '*', orderBy: { column: 'updated_at', ascending: false } });
    return (data ?? []).map((row: any) => ({
      id: row.id,
      companyId: row.company_id,
      stage: asPipelineStage(row.stage),
      owner: asOwner(row.owner ?? row.owner_id ?? 'Unknown'),
      nextAction: row.next_action ?? '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } satisfies PipelineRow));
  }

  async getPipelineByCompany(companyId: string) {
    const rows = await this.listPipelineRows();
    return rows.find((item: PipelineRow) => item.companyId === companyId) ?? null;
  }

  async savePipelineRow(row: Omit<PipelineRow, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
    const now = new Date().toISOString();
    const current = await this.getPipelineByCompany(row.companyId);
    const saved: PipelineRow = {
      id: current?.id ?? row.id ?? crypto.randomUUID(),
      companyId: row.companyId,
      stage: row.stage,
      owner: row.owner,
      nextAction: row.nextAction,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };
    if (this.shouldUseFallbackForRuntime()) {
      return this.fallback.savePipelineRow(row);
    }
    const client = this.ensureClient();
    if (current) {
      await client.update('pipeline', {
        stage: saved.stage,
        owner: saved.owner,
        next_action: saved.nextAction,
        updated_at: saved.updatedAt,
      }, [{ column: 'company_id', operator: 'eq', value: saved.companyId }]);
    } else {
      await client.insert('pipeline', [{
        id: saved.id,
        company_id: saved.companyId,
        stage: saved.stage,
        owner: saved.owner,
        next_action: saved.nextAction,
        created_at: saved.createdAt,
        updated_at: saved.updatedAt,
      }]);
    }
    return (await this.getPipelineByCompany(row.companyId)) ?? saved;
  }

  async movePipelineStage(companyId: string, stage: PipelineStage) {
    const current = await this.getPipelineByCompany(companyId);
    if (!current) return null;
    return this.savePipelineRow({ ...current, stage });
  }

  async updateNextAction(companyId: string, nextAction: string) {
    const current = await this.getPipelineByCompany(companyId);
    if (!current) return null;
    return this.savePipelineRow({ ...current, nextAction });
  }

  async listActivities(companyId?: string) {
    if (this.shouldUseFallbackForRuntime()) return this.fallback.listActivities(companyId);
    const client = this.ensureClient();
    const data = await client.select('activities', { select: '*', ...(companyId ? { filters: [{ column: 'company_id', operator: 'eq', value: companyId }] } : {}), orderBy: { column: 'created_at', ascending: false } });
    return (data ?? []).map((row: any) => ({
      id: row.id,
      companyId: row.company_id,
      type: row.type ?? row.activity_type ?? 'other',
      title: row.title,
      description: row.description ?? '',
      owner: asOwner(row.owner ?? row.owner_id ?? 'Unknown'),
      status: asActivityStatus(row.status ?? 'open'),
      dueDate: row.due_date ?? row.due_at ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? row.created_at,
    } satisfies ActivityRecord));
  }

  async saveActivity(activity: Omit<ActivityRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
    const now = new Date().toISOString();
    const saved: ActivityRecord = { ...activity, id: activity.id ?? crypto.randomUUID(), createdAt: now, updatedAt: now };
    if (this.shouldUseFallbackForRuntime()) return this.fallback.saveActivity(activity);
    const client = this.ensureClient();
    await client.insert('activities', [{
      id: saved.id,
      company_id: saved.companyId,
      type: saved.type,
      activity_type: saved.type,
      title: saved.title,
      description: saved.description,
      owner: saved.owner,
      status: saved.status,
      due_date: saved.dueDate,
      due_at: saved.dueDate,
      created_at: saved.createdAt,
      updated_at: saved.updatedAt,
    }]);
    return saved;
  }

  async listTasks(companyId?: string) {
    if (this.shouldUseFallbackForRuntime()) return this.fallback.listTasks(companyId);
    const client = this.ensureClient();
    const data = await client.select('tasks', { select: '*', ...(companyId ? { filters: [{ column: 'company_id', operator: 'eq', value: companyId }] } : {}), orderBy: { column: 'created_at', ascending: false } });
    return (data ?? []).map((row: any) => ({
      id: row.id,
      companyId: row.company_id,
      title: row.title,
      description: row.description ?? row.payload?.description ?? '',
      owner: asOwner(row.owner ?? row.owner_id ?? 'Unknown'),
      status: row.status ?? 'todo',
      dueDate: row.due_date ?? row.payload?.due_date ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? row.created_at,
    } satisfies TaskRecord));
  }

  async saveTask(task: Omit<TaskRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
    const now = new Date().toISOString();
    const saved: TaskRecord = { ...task, id: task.id ?? crypto.randomUUID(), createdAt: now, updatedAt: now };
    if (this.shouldUseFallbackForRuntime()) return this.fallback.saveTask(task);
    const client = this.ensureClient();
    await client.insert('tasks', [{
      id: saved.id,
      company_id: saved.companyId,
      title: saved.title,
      description: saved.description,
      owner: saved.owner,
      status: saved.status,
      due_date: saved.dueDate,
      payload: { description: saved.description, due_date: saved.dueDate },
      created_at: saved.createdAt,
      updated_at: saved.updatedAt,
    }]);
    return saved;
  }

  async updateTask(taskId: string, updates: Partial<Pick<TaskRecord, 'title' | 'description' | 'owner' | 'status' | 'dueDate'>>) {
    if (this.shouldUseFallbackForRuntime()) return this.fallback.updateTask(taskId, updates);
    const client = this.ensureClient();
    await client.update('tasks', {
      ...(updates.title !== undefined ? { title: updates.title } : {}),
      ...(updates.description !== undefined ? { description: updates.description } : {}),
      ...(updates.owner !== undefined ? { owner: updates.owner } : {}),
      ...(updates.status !== undefined ? { status: updates.status } : {}),
      ...(updates.dueDate !== undefined ? { due_date: updates.dueDate } : {}),
      updated_at: new Date().toISOString(),
    }, [{ column: 'id', operator: 'eq', value: taskId }]);
    const allTasks = await this.listTasks();
    return allTasks.find((item: TaskRecord) => item.id === taskId) ?? null;
  }

  async seedBaseData() {
    await this.writeWithFallback(async () => {
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
      })), 'id');

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
      })), 'id');

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
        profile_payload: mergeProfilePayload(item, profileToFilters(item)),
      })), 'id');

      await client.delete('search_profile_filters', [{ column: 'profile_id', operator: 'in', value: searchProfileSeeds.map((item) => item.id) }]);
      await client.insert('search_profile_filters', searchProfileFilterSeeds.map((item) => ({
        profile_id: item.profileId,
        filter_key: item.filterKey,
        filter_value: item.filterValue,
        created_at: item.createdAt,
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
      })), 'id');

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
    }, () => this.fallback.seedBaseData());

    if (env.bootstrapSupabase) {
      await this.fallback.seedBaseData();
    }
  }
}

export const createPlatformRepository = (mode: 'memory' | 'supabase'): PlatformRepository => (mode === 'supabase' ? new SupabasePlatformRepository() : new MemoryPlatformRepository());
