import type { PlatformService } from './platformService.js';
import { CompanyIntelligenceService } from './companyIntelligenceService.js';

export type CompanyDecisionMemo = {
  companyId: string;
  companyName: string;
  suggestedStructure: string;
  qualificationScore: number;
  leadScore: number;
  rankingScore: number;
  triggerStrength: number;
  intelligenceConfidence: number;
  fitForStructuredCredit: boolean;
  whyNow: string;
  recommendedNextStep: string;
  topSignals: string[];
  topPatterns: string[];
  thesisSummary?: string;
};

export class CompanyDecisionMemoService {
  private readonly intelligenceService = new CompanyIntelligenceService();

  constructor(private readonly platformService: PlatformService) {}

  async build(companyId: string): Promise<CompanyDecisionMemo | null> {
    const detail = await this.platformService.getCompanyDetail(companyId);
    if (!detail) return null;

    const intelligence = await this.intelligenceService.getCompanySummary(companyId);
    const whyNow = detail.signals[0]?.note
      ?? detail.monitoring.feedHighlights?.[0]
      ?? detail.qualification.capital_structure_rationale
      ?? intelligence.recommendedNextStep;

    return {
      companyId,
      companyName: detail.company.name,
      suggestedStructure: detail.qualification.suggested_structure_type,
      qualificationScore: detail.scores.qualification,
      leadScore: detail.scores.lead,
      rankingScore: detail.scores.rankingScore,
      triggerStrength: detail.company.triggerStrength,
      intelligenceConfidence: intelligence.intelligenceConfidence,
      fitForStructuredCredit: intelligence.inferredFlags.fitForStructuredCredit,
      whyNow,
      recommendedNextStep: intelligence.recommendedNextStep || detail.company.nextAction,
      topSignals: intelligence.topSignalTypes.slice(0, 3),
      topPatterns: detail.patterns.map((item) => item.patternName).slice(0, 3),
      thesisSummary: detail.thesis.summary,
    };
  }
}
