import { agentDefinitions } from '../modules/agents.js';
import { ingestCompanyMonitoring } from '../lib/connectors.js';
import { PIPELINE_STAGES } from '../lib/crm.js';
import { env } from '../lib/env.js';
import { isoNow } from '../lib/helpers.js';
import { detectCompanyPatterns } from '../lib/patterns.js';
import { buildQualificationSnapshot } from '../lib/qualification.js';
import { buildRankingRow } from '../lib/ranking.js';
import { computeLeadScore } from '../lib/scoring.js';
import { buildThesisOutput } from '../lib/thesis.js';
import type {
  ActivityRecord,
  CompanyDetailView,
  CompanyPattern,
  CompanySeed,
  CompanySignal,
  DashboardView,
  EnrichmentRecord,
  LeadScoreSnapshot,
  MonitoringOutput,
  PatternCatalogEntry,
  PipelineStage,
  QualificationSnapshot,
  RankingRow,
  ScoreSnapshot,
  TaskRecord,
  PriorityBucket,
} from '../types/platform.js';
import type { PlatformRepository } from '../repositories/platformRepository.js';

const latestByCompany = <T extends { companyId: string; createdAt?: string; created_at?: string }>(items: T[]) => {
  const map = new Map<string, T>();
  for (const item of items) {
    const current = map.get(item.companyId);
    const stamp = item.createdAt ?? item.created_at ?? '';
    const currentStamp = current ? (current.createdAt ?? current.created_at ?? '') : '';
    if (!current || stamp >= currentStamp) map.set(item.companyId, item);
  }
  return map;
};

const groupByCompany = <T extends { companyId: string }>(items: T[]) => items.reduce((acc, item) => {
  const current = acc.get(item.companyId) ?? [];
  current.push(item);
  acc.set(item.companyId, current);
  return acc;
}, new Map<string, T[]>());

const toCompanySignalView = (signal: CompanySignal) => ({
  type: signal.signalType,
  strength: signal.signalStrength,
  confidence: signal.confidenceScore,
  note: String(signal.evidencePayload.note ?? signal.evidencePayload.summary ?? signal.signalType),
  source: signal.sourceId ?? 'unknown_source',
});

const fallbackEnrichment = (company: CompanySeed) => company.enrichment;

export class PlatformService {
  constructor(private readonly repository: PlatformRepository) {}

  async bootstrap() {
    await this.repository.seedBaseData();
    await this.refreshMonitoring();
    await this.recomputeDerivedData();
  }

  private async hydrateCompanies() {
    const [companies, signals, enrichments, monitoringOutputs] = await Promise.all([
      this.repository.listCompanies(),
      this.repository.listCompanySignals(),
      this.repository.listEnrichments(),
      this.repository.listMonitoringOutputs(),
    ]);

    const signalsByCompany = groupByCompany(signals);
    const enrichmentsByCompany = groupByCompany(enrichments);
    const outputsByCompany = groupByCompany(monitoringOutputs);

    return companies.map((company) => {
      const latestEnrichment = (enrichmentsByCompany.get(company.id) ?? []).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      const companySignals = (signalsByCompany.get(company.id) ?? []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const companyOutputs = (outputsByCompany.get(company.id) ?? []).sort((a, b) => b.collectedAt.localeCompare(a.collectedAt));
      const websiteChanges = companyOutputs.filter((item) => item.sourceId === 'src_company_website').slice(0, 2).map((item) => item.summary);
      const feedHighlights = companyOutputs.filter((item) => item.sourceId !== 'src_company_website').slice(0, 3).map((item) => item.summary);

      return {
        ...company,
        signals: companySignals.length ? companySignals.map(toCompanySignalView) : company.signals,
        enrichment: latestEnrichment?.payload ? { ...fallbackEnrichment(company), ...latestEnrichment.payload } : company.enrichment,
        monitoring: {
          ...company.monitoring,
          status: companyOutputs.some((item) => item.connectorStatus === 'real') ? 'active' : company.monitoring.status,
          lastRunAt: companyOutputs[0]?.collectedAt ?? company.monitoring.lastRunAt,
          outputs24h: companyOutputs.length,
          triggers24h: companySignals.filter((signal) => signal.signalStrength >= 65).length,
          websiteChanges: websiteChanges.length ? websiteChanges : company.monitoring.websiteChanges,
          feedHighlights: feedHighlights.length ? feedHighlights : company.monitoring.feedHighlights,
        },
      } satisfies CompanySeed;
    });
  }

  async refreshMonitoring(companyId?: string) {
    const [companies, sources] = await Promise.all([this.hydrateCompanies(), this.repository.listSources()]);
    const targetCompanies = companyId ? companies.filter((item) => item.id === companyId) : companies;
    const ingestions = await Promise.all(targetCompanies.map((company) => ingestCompanyMonitoring(company, sources)));
    await this.repository.saveMonitoringOutputs(ingestions.flatMap((item) => item.outputs));
    await this.repository.saveCompanySignals(ingestions.flatMap((item) => item.signals));
    await this.repository.saveEnrichments(ingestions.flatMap((item) => item.enrichments));
    return { companyCount: targetCompanies.length, outputCount: ingestions.reduce((sum, item) => sum + item.outputs.length, 0) };
  }

  private buildSnapshots(companies: CompanySeed[], monitoringOutputs: MonitoringOutput[], patternCatalog: PatternCatalogEntry[]) {
    const generatedAt = isoNow();
    const outputsByCompany = groupByCompany(monitoringOutputs);

    const qualifications: QualificationSnapshot[] = companies.map((company) => buildQualificationSnapshot({
      company,
      monitoringOutputs: outputsByCompany.get(company.id) ?? [],
      generatedAt,
    }));

    const patterns: CompanyPattern[] = companies.flatMap((company) => {
      const qualification = qualifications.find((item) => item.companyId === company.id)!;
      const companyOutputs = outputsByCompany.get(company.id) ?? [];
      return detectCompanyPatterns(company, qualification, patternCatalog, companyOutputs);
    });

    const patchedQualifications = qualifications.map((qualification) => {
      const qualificationPatterns = patterns.filter((pattern) => pattern.companyId === qualification.companyId);
      const qualificationImpact = qualificationPatterns.reduce((sum, pattern) => sum + pattern.qualificationImpact, 0);
      const urgencyImpact = Math.round(qualificationPatterns.reduce((sum, pattern) => sum + pattern.confidenceScore * 6, 0));
      const predictedFundingNeedImpact = Math.round(qualificationPatterns.reduce((sum, pattern) => sum + (pattern.qualificationImpact + pattern.rankingImpact) / 2, 0));
      return {
        ...qualification,
        qualification_score_total: Math.min(100, qualification.qualification_score_total + qualificationImpact),
        predicted_funding_need_score: Math.min(100, qualification.predicted_funding_need_score + predictedFundingNeedImpact),
        urgency_score: Math.min(100, qualification.urgency_score + urgencyImpact),
        rationale_summary: `${qualification.rationale_summary} Patterns ativos: ${qualificationPatterns.map((pattern) => pattern.patternName).join(', ') || 'nenhum relevante'}.`,
        evidence_payload: {
          ...qualification.evidence_payload,
          patterns: qualificationPatterns.map((pattern) => ({
            id: pattern.patternId,
            name: pattern.patternName,
            confidence: pattern.confidenceScore,
            rationale: pattern.rationale,
          })),
        },
        pattern_summary: qualificationPatterns.map((pattern) => pattern.patternName),
      };
    });

    const scoreSnapshots: ScoreSnapshot[] = patchedQualifications.flatMap((qualification) => ([
      {
        companyId: qualification.companyId,
        scoreType: 'qualification',
        scoreValue: qualification.qualification_score_total,
        rationale: qualification.rationale_summary,
        version: 2,
        createdAt: generatedAt,
      },
      {
        companyId: qualification.companyId,
        scoreType: 'funding_need',
        scoreValue: qualification.predicted_funding_need_score,
        rationale: 'Predição de funding need a partir de sinais, monitoring outputs e enrichment.',
        version: 2,
        createdAt: generatedAt,
      },
      {
        companyId: qualification.companyId,
        scoreType: 'urgency',
        scoreValue: qualification.urgency_score,
        rationale: 'Urgência ponderando triggers, pressão de capital e padrões ativos.',
        version: 2,
        createdAt: generatedAt,
      },
    ]));

    const leadScoreSnapshots: LeadScoreSnapshot[] = companies.map((company) => {
      const qualification = patchedQualifications.find((item) => item.companyId === company.id)!;
      const companyPatterns = patterns.filter((pattern) => pattern.companyId === company.id);
      const patternScore = companyPatterns.reduce((sum, pattern) => sum + pattern.leadScoreImpact, 0);
      const leadScore = computeLeadScore({
        qualificationScore: qualification.qualification_score_total,
        sourceConfidence: qualification.source_confidence_score,
        triggerStrength: qualification.trigger_strength_score,
        timingIntensity: qualification.urgency_score,
        executionReadiness: qualification.qualification_score_execution,
        dataQuality: qualification.confidence_score * 100,
        pipelineReadiness: qualification.predicted_funding_need_score,
        patternScore,
      });

      return {
        companyId: company.id,
        leadScore: leadScore.score,
        bucket: leadScore.bucket as PriorityBucket,
        rationale: `Lead score combina qualification, monitoring real, connector confidence e impacto dos padrões (${patternScore}).`,
        nextAction: company.activities[0]?.title ?? 'Executar análise comercial',
        sourceConfidence: qualification.source_confidence_score,
        triggerStrength: qualification.trigger_strength_score,
        patternScore,
        createdAt: generatedAt,
      };
    });

    return { generatedAt, qualifications: patchedQualifications, patterns, scoreSnapshots, leadScoreSnapshots };
  }

  async recomputeDerivedData(companyId?: string) {
    const [companies, patternCatalog, monitoringOutputs] = await Promise.all([
      this.hydrateCompanies(),
      this.repository.listPatternCatalog(),
      this.repository.listMonitoringOutputs(),
    ]);

    const targetCompanies = companyId ? companies.filter((item) => item.id === companyId) : companies;
    const companyIds = new Set(targetCompanies.map((item) => item.id));
    const relevantOutputs = monitoringOutputs.filter((item) => companyIds.has(item.companyId));
    const snapshots = this.buildSnapshots(targetCompanies, relevantOutputs, patternCatalog);

    await this.repository.saveQualificationSnapshots(snapshots.qualifications);
    await this.repository.saveCompanyPatterns(snapshots.patterns);
    await this.repository.saveScoreSnapshots(snapshots.scoreSnapshots);
    await this.repository.saveLeadScoreSnapshots(snapshots.leadScoreSnapshots);
    return snapshots;
  }

  private async ensureDerivedData() {
    const [qualifications, leadScores] = await Promise.all([
      this.repository.listQualificationSnapshots(),
      this.repository.listLeadScoreSnapshots(),
    ]);

    if (!qualifications.length || !leadScores.length) {
      await this.recomputeDerivedData();
    }
  }

  private async assembleViews() {
    await this.ensureDerivedData();

    const [companies, sources, patternCatalog, monitoringOutputs, qualificationSnapshots, companyPatterns, scoreSnapshots, leadScoreSnapshots] = await Promise.all([
      this.hydrateCompanies(),
      this.repository.listSources(),
      this.repository.listPatternCatalog(),
      this.repository.listMonitoringOutputs(),
      this.repository.listQualificationSnapshots(),
      this.repository.listCompanyPatterns(),
      this.repository.listScoreSnapshots(),
      this.repository.listLeadScoreSnapshots(),
    ]);

    const latestQualifications = latestByCompany(qualificationSnapshots);
    const latestLeads = latestByCompany(leadScoreSnapshots);
    const latestScores = latestByCompany(scoreSnapshots.filter((item) => item.scoreType === 'qualification'));
    const patternByCompany = groupByCompany(companyPatterns);
    const outputsByCompany = groupByCompany(monitoringOutputs);
    const thesisByCompany = new Map(companies.map((company) => {
      const qualification = latestQualifications.get(company.id)!;
      const patterns = patternByCompany.get(company.id) ?? [];
      return [company.id, buildThesisOutput(company, qualification, patterns)] as const;
    }));

    const rankingRows = companies
      .map((company) => buildRankingRow({
        companyId: company.id,
        companyName: company.tradeName,
        qualification: latestQualifications.get(company.id)!,
        lead: latestLeads.get(company.id)!,
        patterns: patternByCompany.get(company.id) ?? [],
      }))
      .sort((a, b) => b.rankingScore - a.rankingScore)
      .map((row, index) => ({ ...row, position: index + 1 }));

    const companyViews = companies.map((company) => {
      const qualification = latestQualifications.get(company.id)!;
      const lead = latestLeads.get(company.id)!;
      const thesis = thesisByCompany.get(company.id)!;
      const patterns = (patternByCompany.get(company.id) ?? []).slice(0, 3).map((item) => item.patternName);
      return {
        id: company.id,
        name: company.tradeName,
        segment: company.segment,
        subsegment: company.subsegment,
        geography: company.geography,
        product: company.creditProduct,
        receivables: company.receivables,
        qualificationScore: qualification.qualification_score_total,
        leadScore: lead.leadScore,
        leadBucket: lead.bucket,
        monitoringStatus: company.monitoring.status,
        suggestedStructure: qualification.suggested_structure_type,
        thesis: thesis.summary,
        nextAction: lead.nextAction,
        predictedFundingNeed: qualification.predicted_funding_need_score,
        urgencyScore: qualification.urgency_score,
        sourceConfidence: qualification.source_confidence_score,
        triggerStrength: qualification.trigger_strength_score,
        topPatterns: patterns,
      };
    });

    return {
      companies,
      companyViews,
      qualifications: latestQualifications,
      patterns: patternByCompany,
      thesisByCompany,
      leadScores: latestLeads,
      rankingRows,
      sources,
      monitoringOutputs: outputsByCompany,
      allMonitoringOutputs: monitoringOutputs,
      scoreSnapshots,
      latestScores,
      leadScoreSnapshots,
      patternCatalog,
      agents: agentDefinitions,
    };
  }

  async getDashboard(): Promise<DashboardView> {
    const { companyViews, rankingRows, patterns, allMonitoringOutputs, agents } = await this.assembleViews();
    const allPatterns = Array.from(patterns.values()).flat();

    return {
      summary: [
        { label: 'Empresas monitoradas', value: String(companyViews.length), tone: 'primary', helper: 'Base vinda do backend com Supabase + fallback local apenas se necessário.' },
        { label: 'Top leads', value: String(rankingRows.filter((row) => row.bucket === 'immediate_priority').length), tone: 'success', helper: 'Prioridade centralizada por ranking real persistido.' },
        { label: 'Padrões ativos', value: String(allPatterns.length), tone: 'warning', helper: 'Cinco padrões práticos e catálogo inicial persistidos no banco.' },
        { label: 'Outputs recentes', value: String(allMonitoringOutputs.length), tone: 'info', helper: 'BrasilAPI, RSS e website alimentando monitoring_outputs.' },
      ],
      topLeads: rankingRows.slice(0, 5),
      monitoring: {
        activeSources: 3,
        outputs24h: allMonitoringOutputs.length,
        triggers24h: companyViews.reduce((sum, company) => sum + Math.round(company.triggerStrength / 25), 0),
        websiteChecks: allMonitoringOutputs.filter((item) => item.sourceId === 'src_company_website').length,
      },
      agents: agents.filter((agent) => ['qualification_agent', 'pattern_identification_agent', 'monitoring_agent', 'lead_score_agent'].includes(agent.name)).map((agent) => ({
        name: agent.name,
        status: agent.status,
        lastRun: new Date().toISOString(),
        note: agent.objective,
      })),
      patterns: Array.from(new Set(allPatterns.map((pattern) => pattern.patternName))).map((patternName) => {
        const current = allPatterns.filter((pattern) => pattern.patternName === patternName);
        return { pattern: patternName, companies: current.length, avgImpact: Math.round(current.reduce((sum, item) => sum + item.leadScoreImpact + item.rankingImpact, 0) / current.length) };
      }).slice(0, 6),
      pipeline: [
        { stage: 'Identified', count: companyViews.length, coverage: 'companies + source catalog' },
        { stage: 'Qualified', count: companyViews.filter((company) => company.qualificationScore >= 70).length, coverage: 'qualification_snapshots' },
        { stage: 'Approach', count: companyViews.filter((company) => company.leadScore >= 70).length, coverage: 'lead_score_snapshots' },
        { stage: 'Structuring', count: companyViews.filter((company) => company.suggestedStructure.includes('FIDC')).length, coverage: 'thesis e patterns' },
      ],
      charts: {
        leadBuckets: [
          { label: 'Immediate', value: rankingRows.filter((row) => row.bucket === 'immediate_priority').length },
          { label: 'High', value: rankingRows.filter((row) => row.bucket === 'high_priority').length },
          { label: 'Monitor', value: rankingRows.filter((row) => row.bucket === 'monitor_closely').length },
          { label: 'Watchlist', value: rankingRows.filter((row) => row.bucket === 'watchlist').length },
        ],
        qualificationVsLead: companyViews.slice(0, 8).map((company) => ({ company: company.name, qualification: company.qualificationScore, lead: company.leadScore })),
      },
    };
  }

  async listCompanies() {
    return (await this.assembleViews()).companyViews;
  }

  async getCompanyDetail(id: string): Promise<CompanyDetailView | null> {
    const { companies, companyViews, qualifications, patterns, thesisByCompany, leadScores, rankingRows, sources, monitoringOutputs, scoreSnapshots, leadScoreSnapshots } = await this.assembleViews();
    const companySeed = companies.find((item) => item.id === id);
    const company = companyViews.find((item) => item.id === id);
    const qualification = qualifications.get(id);
    const lead = leadScores.get(id);
    const ranking = rankingRows.find((item) => item.companyId === id);
    if (!companySeed || !company || !qualification || !lead || !ranking) return null;
    const [activityRows, pipelineRow] = await Promise.all([
      this.repository.listActivities(id),
      this.repository.getPipelineByCompany(id),
    ]);

    const historyDates = Array.from(new Set([
      ...scoreSnapshots.filter((item) => item.companyId === id).map((item) => item.createdAt),
      ...leadScoreSnapshots.filter((item) => item.companyId === id).map((item) => item.createdAt),
    ])).sort();

    const scoreHistory = historyDates.slice(-5).map((at) => ({
      at,
      qualification: scoreSnapshots.find((item) => item.companyId === id && item.scoreType === 'qualification' && item.createdAt === at)?.scoreValue ?? qualification.qualification_score_total,
      lead: leadScoreSnapshots.find((item) => item.companyId === id && item.createdAt === at)?.leadScore ?? lead.leadScore,
    }));

    return {
      company: {
        ...company,
        description: companySeed.description,
        currentFundingStructure: companySeed.currentFundingStructure,
        stage: pipelineRow?.stage ?? companySeed.stage,
        cnpj: companySeed.cnpj,
        website: companySeed.website,
        nextAction: pipelineRow?.nextAction || company.nextAction,
      },
      qualification: {
        ...qualification,
        pattern_summary: (patterns.get(id) ?? []).map((item) => item.patternName),
      },
      patterns: patterns.get(id) ?? [],
      thesis: thesisByCompany.get(id) ?? buildThesisOutput(companySeed, qualification, patterns.get(id) ?? []),
      marketMap: companySeed.marketMapPeers,
      monitoring: companySeed.monitoring,
      signals: companySeed.signals,
      sources,
      activities: (activityRows.length ? activityRows : companySeed.activities.map((activity, index) => ({
        id: `${id}_seed_${index}`,
        companyId: id,
        type: 'follow_up',
        title: activity.title,
        description: activity.title,
        owner: activity.owner,
        status: activity.status,
        dueDate: activity.dueDate,
        createdAt: '',
        updatedAt: '',
      }))).map((activity) => ({
        title: activity.title,
        owner: activity.owner,
        status: activity.status,
        dueDate: activity.dueDate ?? '-',
      })),
      scores: {
        qualification: qualification.qualification_score_total,
        lead: lead.leadScore,
        bucket: lead.bucket,
        rankingScore: ranking.rankingScore,
      },
      scoreHistory,
      monitoringOutputs: monitoringOutputs.get(id) ?? [],
    };
  }

  async getCompanyRanking(id: string) {
    return (await this.getRankings()).find((row) => row.companyId === id) ?? null;
  }

  async getRankings(): Promise<RankingRow[]> {
    return (await this.assembleViews()).rankingRows;
  }

  async recalculateCompany(id: string, reason = 'manual') {
    await this.refreshMonitoring(id);
    const snapshots = await this.recomputeDerivedData(id);
    const latest = snapshots.qualifications.find((item) => item.companyId === id);
    return {
      companyId: id,
      action: 'recalculated',
      reason,
      qualificationScore: latest?.qualification_score_total ?? null,
      urgencyScore: latest?.urgency_score ?? null,
    };
  }

  async listSearchProfiles() { return this.repository.listSearchProfiles(); }

  async saveSearchProfile(input: {
    id?: string;
    name?: string;
    segment: string;
    subsegment: string;
    companyType: string;
    geography: string;
    creditProduct: string;
    receivables: string[];
    targetStructure: string;
    minimumSignalIntensity: number;
    minimumConfidence: number;
    timeWindowDays: number;
    status?: 'active' | 'paused';
    profilePayload?: Record<string, unknown>;
  }) {
    const profile = {
      id: input.id ?? `sp_${input.segment.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now()}`,
      name: input.name ?? `${input.segment} · ${input.targetStructure}`,
      segment: input.segment,
      subsegment: input.subsegment,
      companyType: input.companyType,
      geography: input.geography,
      creditProduct: input.creditProduct,
      receivables: input.receivables,
      targetStructure: input.targetStructure,
      minimumSignalIntensity: input.minimumSignalIntensity,
      minimumConfidence: input.minimumConfidence,
      timeWindowDays: input.timeWindowDays,
      status: input.status ?? 'active',
      profilePayload: input.profilePayload ?? {},
    };

    return this.repository.saveSearchProfile(profile);
  }

  async listSources() { return this.repository.listSources(); }
  async listMonitoringOutputsAll() { return this.repository.listMonitoringOutputs(); }
  async listPatternCatalog(): Promise<PatternCatalogEntry[]> { return this.repository.listPatternCatalog(); }
  async listPipelineRows() { return this.repository.listPipelineRows(); }
  async getMonitoringSnapshot() {
    const [dashboard, companies, sources, signals] = await Promise.all([
      this.getDashboard(),
      this.listCompanies(),
      this.listSources(),
      this.repository.listCompanySignals(),
    ]);

    const companyNameById = new Map(companies.map((company) => [company.id, company.name]));
    const sourceById = new Map(sources.map((source) => [source.id, source]));

    const recentTriggers = [...signals]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 8)
      .map((signal) => ({
        company: companyNameById.get(signal.companyId) ?? signal.companyId,
        signal: signal.signalType,
        source: sourceById.get(signal.sourceId ?? '')?.name ?? signal.sourceId ?? 'unknown_source',
        strength: signal.signalStrength,
        when: new Date(signal.createdAt).toLocaleString('pt-BR'),
      }));

    const latestRuns = dashboard.agents.map((agent) => ({
      workflow: agent.name,
      status: agent.status,
      detail: agent.note,
      when: new Date(agent.lastRun).toLocaleString('pt-BR'),
    }));

    const activeSources = sources.map((source) => ({
      name: source.name,
      status: source.status,
      health: source.health,
      coverage: source.category,
    }));

    return { recentTriggers, latestRuns, activeSources };
  }

  async getAgentsSnapshot() {
    const dashboard = await this.getDashboard();
    const confidenceByStatus: Record<string, number> = { real: 90, partial: 72, mock: 55 };
    const failuresByStatus: Record<string, number> = { real: 0, partial: 1, mock: 2 };

    return {
      items: dashboard.agents.map((agent) => ({
        name: agent.name,
        status: agent.status,
        failures: failuresByStatus[agent.status] ?? 1,
        confidence: confidenceByStatus[agent.status] ?? 65,
        focus: agent.note,
        updatedAt: new Date(agent.lastRun).toLocaleString('pt-BR'),
      })),
    };
  }

  async getPipelineSnapshot() {
    const [rows, stages, activities, companies] = await Promise.all([
      this.listPipelineRows(),
      this.listPipelineStages(),
      this.listActivities(),
      this.listCompanies(),
    ]);
    const companyNameById = new Map(companies.map((company) => [company.id, company.name]));
    const recentActivities = [...activities]
      .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))
      .slice(0, 12)
      .map((activity) => ({
        companyId: activity.companyId,
        companyName: companyNameById.get(activity.companyId) ?? activity.companyId,
        title: activity.title,
        owner: activity.owner,
        dueDate: activity.dueDate,
        status: activity.status,
      }));

    return { mode: (env.useSupabase ? 'real' : 'mock') as const, rows, stages, recentActivities };
  }

  async listPipelineStages() {
    const rows = await this.repository.listPipelineRows();
    const grouped = rows.reduce((acc, row) => {
      acc.set(row.stage, (acc.get(row.stage) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());
    return PIPELINE_STAGES.map((stage) => ({ stage, count: grouped.get(stage) ?? 0 }));
  }
  async getPipelineByCompany(companyId: string) { return this.repository.getPipelineByCompany(companyId); }
  async movePipelineStage(companyId: string, stage: PipelineStage) { return this.repository.movePipelineStage(companyId, stage); }
  async updateNextAction(companyId: string, nextAction: string) { return this.repository.updateNextAction(companyId, nextAction); }
  async listActivities(companyId?: string) { return this.repository.listActivities(companyId); }
  async saveActivity(activity: Omit<ActivityRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) { return this.repository.saveActivity(activity); }
  async listTasks(companyId?: string) { return this.repository.listTasks(companyId); }
  async saveTask(task: Omit<TaskRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) { return this.repository.saveTask(task); }
  async updateTask(taskId: string, updates: Partial<Pick<TaskRecord, 'title' | 'description' | 'owner' | 'status' | 'dueDate'>>) { return this.repository.updateTask(taskId, updates); }
}
