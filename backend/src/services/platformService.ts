import { agentDefinitions } from '../modules/agents.js';
import { buildMonitoringOutputs } from '../lib/connectors.js';
import { isoNow } from '../lib/helpers.js';
import { detectCompanyPatterns } from '../lib/patterns.js';
import { buildQualificationSnapshot } from '../lib/qualification.js';
import { buildRankingRow } from '../lib/ranking.js';
import { computeLeadScore } from '../lib/scoring.js';
import { buildThesisOutput } from '../lib/thesis.js';
import type {
  CompanyDetailView,
  CompanyView,
  DashboardView,
  LeadScoreSnapshot,
  PatternCatalogEntry,
  QualificationSnapshot,
  RankingRow,
  ScoreSnapshot,
} from '../types/platform.js';
import type { PlatformRepository } from '../repositories/platformRepository.js';

export class PlatformService {
  constructor(private readonly repository: PlatformRepository) {}

  async bootstrap() {
    await this.repository.seedBaseData();
    const companies = await this.repository.listCompanies();
    const sources = await this.repository.listSources();
    const monitoringOutputs = await buildMonitoringOutputs(companies, sources);
    await this.repository.saveMonitoringOutputs(monitoringOutputs);

    const patternCatalog = await this.repository.listPatternCatalog();
    const generatedAt = isoNow();

    const qualifications: QualificationSnapshot[] = companies.map((company) => buildQualificationSnapshot(company, generatedAt));
    const patterns = companies.flatMap((company) => {
      const qualification = qualifications.find((item) => item.companyId === company.id)!;
      return detectCompanyPatterns(company, qualification, patternCatalog).map((pattern) => pattern);
    });

    const patchedQualifications = qualifications.map((qualification) => ({
      ...qualification,
      pattern_summary: patterns.filter((pattern) => pattern.companyId === qualification.companyId).map((pattern) => pattern.patternName),
    }));

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
        rationale: 'Predição de funding need pelo qualification_agent v1.',
        version: 1,
        createdAt: generatedAt,
      },
      {
        companyId: qualification.companyId,
        scoreType: 'urgency',
        scoreValue: qualification.urgency_score,
        rationale: 'Urgência sintetizando trigger strength e funding gap.',
        version: 1,
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
        bucket: leadScore.bucket,
        rationale: `Lead score combina RankingV2Service, sinais, qualification e impactos de padrões (${patternScore}).`,
        nextAction: company.activities[0]?.title ?? 'Executar análise comercial',
        sourceConfidence: qualification.source_confidence_score,
        triggerStrength: qualification.trigger_strength_score,
        patternScore,
        createdAt: generatedAt,
      };
    });

    await this.repository.saveQualificationSnapshots(patchedQualifications);
    await this.repository.saveCompanyPatterns(patterns);
    await this.repository.saveScoreSnapshots(scoreSnapshots);
    await this.repository.saveLeadScoreSnapshots(leadScoreSnapshots);
  }

  private async assembleViews() {
    const companies = await this.repository.listCompanies();
    const sources = await this.repository.listSources();
    const patternCatalog = await this.repository.listPatternCatalog();
    const monitoringOutputs = await this.repository.listMonitoringOutputs();

    const generatedAt = isoNow();
    const qualifications = companies.map((company) => buildQualificationSnapshot(company, generatedAt));
    const patterns = companies.flatMap((company) => detectCompanyPatterns(company, qualifications.find((item) => item.companyId === company.id)!, patternCatalog));
    const theses = companies.map((company) => buildThesisOutput(company, qualifications.find((item) => item.companyId === company.id)!, patterns.filter((item) => item.companyId === company.id)));
    const leadScores = companies.map((company) => {
      const qualification = qualifications.find((item) => item.companyId === company.id)!;
      const companyPatterns = patterns.filter((item) => item.companyId === company.id);
      const patternScore = companyPatterns.reduce((sum, pattern) => sum + pattern.leadScoreImpact, 0);
      const computed = computeLeadScore({
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
        leadScore: computed.score,
        bucket: computed.bucket,
        rationale: `Lead score dinâmico com impactos de patterns + source confidence + trigger strength.`,
        nextAction: company.activities[0]?.title ?? 'Executar playbook comercial',
        sourceConfidence: qualification.source_confidence_score,
        triggerStrength: qualification.trigger_strength_score,
        patternScore,
        createdAt: generatedAt,
      };
    });

    const rankingRows = companies
      .map((company) => buildRankingRow({
        companyId: company.id,
        companyName: company.tradeName,
        qualification: qualifications.find((item) => item.companyId === company.id)!,
        lead: leadScores.find((item) => item.companyId === company.id)!,
        patterns: patterns.filter((item) => item.companyId === company.id),
      }))
      .sort((a, b) => b.rankingScore - a.rankingScore)
      .map((row, index) => ({ ...row, position: index + 1 }));

    const companyViews: CompanyView[] = companies.map((company) => {
      const qualification = qualifications.find((item) => item.companyId === company.id)!;
      const lead = leadScores.find((item) => item.companyId === company.id)!;
      const thesis = theses.find((item) => item.structureType === qualification.suggested_structure_type && item.summary.includes(company.tradeName))!;
      const companyPatterns = patterns.filter((item) => item.companyId === company.id);
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
        topPatterns: companyPatterns.slice(0, 3).map((item) => item.patternName),
      };
    });

    return { companies, companyViews, qualifications, patterns, theses, leadScores, rankingRows, sources, monitoringOutputs, agents: agentDefinitions };
  }

  async getDashboard(): Promise<DashboardView> {
    const { companyViews, rankingRows, patterns, monitoringOutputs, agents } = await this.assembleViews();

    return {
      summary: [
        { label: 'Empresas monitoradas', value: String(companyViews.length), tone: 'primary', helper: 'Base consolidada na arquitetura oficial atual.' },
        { label: 'Top leads', value: String(rankingRows.filter((row) => row.bucket === 'immediate_priority').length), tone: 'success', helper: 'Prioridade imediata pelo Ranking V2.' },
        { label: 'Padrões ativos', value: String(patterns.length), tone: 'warning', helper: 'Pattern catalog com 10 padrões canônicos.' },
        { label: 'Outputs 24h', value: String(monitoringOutputs.length), tone: 'info', helper: 'Connectors reais/parciais com fallback preenchido.' },
      ],
      topLeads: rankingRows.slice(0, 5),
      monitoring: {
        activeSources: 4,
        outputs24h: monitoringOutputs.length,
        triggers24h: companyViews.reduce((sum, company) => sum + Math.round(company.triggerStrength / 25), 0),
        websiteChecks: monitoringOutputs.filter((item) => item.sourceId === 'src_company_website').length,
      },
      agents: agents.filter((agent) => ['qualification_agent', 'pattern_identification_agent', 'monitoring_agent', 'lead_score_agent'].includes(agent.name)).map((agent) => ({
        name: agent.name,
        status: agent.status,
        lastRun: new Date().toISOString(),
        note: agent.objective,
      })),
      patterns: Array.from(new Set(patterns.map((pattern) => pattern.patternName))).map((patternName) => {
        const current = patterns.filter((pattern) => pattern.patternName === patternName);
        return { pattern: patternName, companies: current.length, avgImpact: Math.round(current.reduce((sum, item) => sum + item.leadScoreImpact + item.rankingImpact, 0) / current.length) };
      }).slice(0, 6),
      pipeline: [
        { stage: 'Identified', count: companyViews.length, coverage: 'Base seeded + monitoring' },
        { stage: 'Qualified', count: companyViews.filter((company) => company.qualificationScore >= 70).length, coverage: 'qualification_agent' },
        { stage: 'Approach', count: companyViews.filter((company) => company.leadScore >= 70).length, coverage: 'lead_score_agent' },
        { stage: 'Structuring', count: companyViews.filter((company) => company.suggestedStructure.includes('FIDC')).length, coverage: 'thesis + market map' },
      ],
      charts: {
        leadBuckets: [
          { label: 'Immediate', value: rankingRows.filter((row) => row.bucket === 'immediate_priority').length },
          { label: 'High', value: rankingRows.filter((row) => row.bucket === 'high_priority').length },
          { label: 'Monitor', value: rankingRows.filter((row) => row.bucket === 'monitor_closely').length },
          { label: 'Watchlist', value: rankingRows.filter((row) => row.bucket === 'watchlist').length },
        ],
        qualificationVsLead: companyViews.map((company) => ({ company: company.name, qualification: company.qualificationScore, lead: company.leadScore })),
      },
    };
  }

  async listCompanies() {
    return (await this.assembleViews()).companyViews;
  }

  async getCompanyDetail(id: string): Promise<CompanyDetailView | null> {
    const { companies, companyViews, qualifications, patterns, theses, leadScores, rankingRows, sources, monitoringOutputs } = await this.assembleViews();
    const companySeed = companies.find((item) => item.id === id);
    const company = companyViews.find((item) => item.id === id);
    const qualification = qualifications.find((item) => item.companyId === id);
    const lead = leadScores.find((item) => item.companyId === id);
    const ranking = rankingRows.find((item) => item.companyId === id);
    if (!companySeed || !company || !qualification || !lead || !ranking) return null;

    return {
      company: {
        ...company,
        description: companySeed.description,
        currentFundingStructure: companySeed.currentFundingStructure,
        stage: companySeed.stage,
        cnpj: companySeed.cnpj,
        website: companySeed.website,
      },
      qualification: {
        ...qualification,
        pattern_summary: patterns.filter((item) => item.companyId === id).map((item) => item.patternName),
      },
      patterns: patterns.filter((item) => item.companyId === id),
      thesis: theses.find((item) => item.summary.includes(companySeed.tradeName))!,
      marketMap: companySeed.marketMapPeers,
      monitoring: companySeed.monitoring,
      signals: companySeed.signals,
      sources,
      activities: companySeed.activities,
      scores: {
        qualification: qualification.qualification_score_total,
        lead: lead.leadScore,
        bucket: lead.bucket,
        rankingScore: ranking.rankingScore,
      },
      scoreHistory: [
        { at: '2026-02-21', qualification: Math.max(qualification.qualification_score_total - 7, 40), lead: Math.max(lead.leadScore - 6, 35) },
        { at: '2026-03-07', qualification: Math.max(qualification.qualification_score_total - 3, 45), lead: Math.max(lead.leadScore - 2, 40) },
        { at: '2026-03-21', qualification: qualification.qualification_score_total, lead: lead.leadScore },
      ],
      monitoringOutputs: monitoringOutputs.filter((item) => item.companyId === id),
    };
  }

  async getCompanyRanking(id: string) {
    return (await this.getRankings()).find((row) => row.companyId === id) ?? null;
  }

  async getRankings(): Promise<RankingRow[]> {
    return (await this.assembleViews()).rankingRows;
  }

  async listSearchProfiles() { return this.repository.listSearchProfiles(); }
  async listSources() { return this.repository.listSources(); }
  async listMonitoringOutputsAll() { return this.repository.listMonitoringOutputs(); }
  async listPatternCatalog(): Promise<PatternCatalogEntry[]> { return this.repository.listPatternCatalog(); }
}
