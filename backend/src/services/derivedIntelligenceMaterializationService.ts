import { isCompanyDecisionEligible } from '../lib/companyDecisionEligibility.js';
import { createPlatformRepository, type PlatformRepository } from '../repositories/platformRepository.js';
import { getDataClient } from '../lib/dataClient.js';
import { PlatformService } from './platformService.js';
import type { CompanySeed, LeadScoreSnapshot, MonitoringOutput, QualificationSnapshot } from '../types/platform.js';

type DueCompany = {
  companyId: string;
  reason: 'missing_qualification' | 'missing_lead_score' | 'new_monitoring_evidence';
};

const stamp = (value: string | undefined) => {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
};

const latestByCompany = <T extends { companyId: string; createdAt?: string; created_at?: string }>(items: T[]) => {
  const latest = new Map<string, T>();
  for (const item of items) {
    const current = latest.get(item.companyId);
    if (!current || stamp(item.createdAt ?? item.created_at) > stamp(current.createdAt ?? current.created_at)) {
      latest.set(item.companyId, item);
    }
  }
  return latest;
};

const latestMonitoringByCompany = (items: MonitoringOutput[]) => {
  const latest = new Map<string, MonitoringOutput>();
  for (const item of items) {
    const current = latest.get(item.companyId);
    if (!current || stamp(item.collectedAt) > stamp(current.collectedAt)) latest.set(item.companyId, item);
  }
  return latest;
};

export const selectCompaniesForDerivedMaterialization = ({
  companies,
  qualifications,
  leadScores,
  monitoringOutputs,
  limit = 25,
}: {
  companies: CompanySeed[];
  qualifications: QualificationSnapshot[];
  leadScores: LeadScoreSnapshot[];
  monitoringOutputs: MonitoringOutput[];
  limit?: number;
}): DueCompany[] => {
  const latestQualifications = latestByCompany(qualifications);
  const latestLeads = latestByCompany(leadScores);
  const latestMonitoring = latestMonitoringByCompany(monitoringOutputs);

  return companies
    .filter(isCompanyDecisionEligible)
    .map((company): DueCompany | null => {
      const qualification = latestQualifications.get(company.id);
      if (!qualification) return { companyId: company.id, reason: 'missing_qualification' };
      const lead = latestLeads.get(company.id);
      if (!lead) return { companyId: company.id, reason: 'missing_lead_score' };
      const monitoring = latestMonitoring.get(company.id);
      if (monitoring && stamp(monitoring.collectedAt) > Math.min(stamp(qualification.created_at), stamp(lead.createdAt))) {
        return { companyId: company.id, reason: 'new_monitoring_evidence' };
      }
      return null;
    })
    .filter((item): item is DueCompany => Boolean(item))
    .slice(0, Math.max(1, Math.min(100, Math.trunc(limit))));
};

export type DerivedMaterializationSummary = {
  status: 'real' | 'partial';
  consideredCompanies: number;
  dueCompanies: number;
  recomputedCompanies: number;
  pipelineRowsTouched: number;
  qualificationsWritten: number;
  patternsWritten: number;
  scoreSnapshotsWritten: number;
  leadScoreSnapshotsWritten: number;
  rankingRefreshed: boolean;
  errors: string[];
  companies: Array<{ companyId: string; reason: DueCompany['reason']; qualificationScore?: number; leadScore?: number }>;
};

export class DerivedIntelligenceMaterializationService {
  private readonly repository: PlatformRepository;
  private readonly platform: PlatformService;
  private readonly client = getDataClient();

  constructor(repository: PlatformRepository = createPlatformRepository('database')) {
    this.repository = repository;
    this.platform = new PlatformService(repository);
  }

  async run(limit = 25): Promise<DerivedMaterializationSummary> {
    if (!this.client) {
      return {
        status: 'partial',
        consideredCompanies: 0,
        dueCompanies: 0,
        recomputedCompanies: 0,
        pipelineRowsTouched: 0,
        qualificationsWritten: 0,
        patternsWritten: 0,
        scoreSnapshotsWritten: 0,
        leadScoreSnapshotsWritten: 0,
        rankingRefreshed: false,
        errors: ['Neon data client not configured.'],
        companies: [],
      };
    }

    const [companies, qualifications, leadScores, monitoringOutputs] = await Promise.all([
      this.repository.listCompanies(),
      this.repository.listQualificationSnapshots(),
      this.repository.listLeadScoreSnapshots(),
      this.repository.listMonitoringOutputs(),
    ]);

    const due = selectCompaniesForDerivedMaterialization({
      companies,
      qualifications,
      leadScores,
      monitoringOutputs,
      limit,
    });

    const summary: DerivedMaterializationSummary = {
      status: 'real',
      consideredCompanies: companies.filter(isCompanyDecisionEligible).length,
      dueCompanies: due.length,
      recomputedCompanies: 0,
      pipelineRowsTouched: 0,
      qualificationsWritten: 0,
      patternsWritten: 0,
      scoreSnapshotsWritten: 0,
      leadScoreSnapshotsWritten: 0,
      rankingRefreshed: false,
      errors: [],
      companies: [],
    };

    for (const item of due) {
      try {
        const snapshots = await this.platform.recomputeDerivedData(item.companyId);
        const qualification = snapshots.qualifications[0];
        const lead = snapshots.leadScoreSnapshots[0];
        summary.recomputedCompanies += snapshots.qualifications.length ? 1 : 0;
        summary.qualificationsWritten += snapshots.qualifications.length;
        summary.patternsWritten += snapshots.patterns.length;
        summary.scoreSnapshotsWritten += snapshots.scoreSnapshots.length;
        summary.leadScoreSnapshotsWritten += snapshots.leadScoreSnapshots.length;
        summary.companies.push({
          companyId: item.companyId,
          reason: item.reason,
          qualificationScore: qualification?.qualification_score_total,
          leadScore: lead?.leadScore,
        });

        if (qualification && lead) {
          const current = await this.repository.getPipelineByCompany(item.companyId);
          const nextStage = current?.stage && !['Identified', 'Qualified'].includes(current.stage)
            ? current.stage
            : qualification.qualification_score_total >= 70 ? 'Qualified' : 'Identified';
          await this.repository.savePipelineRow({
            companyId: item.companyId,
            stage: nextStage,
            owner: current?.owner ?? 'Origination',
            nextAction: lead.nextAction || 'Validar tese comercial e próximos dados críticos.',
          });
          summary.pipelineRowsTouched += 1;
        }
      } catch (error) {
        summary.errors.push(`${item.companyId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (summary.recomputedCompanies > 0) {
      try {
        await this.client.rpc('refresh_ranking_v2', {});
        summary.rankingRefreshed = true;
      } catch (error) {
        summary.errors.push(`refresh_ranking_v2: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    summary.status = summary.errors.length ? 'partial' : 'real';
    return summary;
  }
}
