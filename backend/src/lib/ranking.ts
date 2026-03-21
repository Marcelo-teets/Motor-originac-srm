import { clamp } from './helpers.js';
import type { CompanyPattern, LeadScoreSnapshot, QualificationSnapshot, RankingRow } from '../types/platform.js';

export const buildRankingRow = (input: {
  companyId: string;
  companyName: string;
  qualification: QualificationSnapshot;
  lead: LeadScoreSnapshot;
  patterns: CompanyPattern[];
}): RankingRow => {
  const patternWeight = input.patterns.reduce((sum, pattern) => sum + pattern.rankingImpact, 0);
  const rankingScore = clamp(
    input.qualification.qualification_score_total * 0.4 +
      input.lead.leadScore * 0.35 +
      input.qualification.trigger_strength_score * 0.1 +
      input.qualification.source_confidence_score * 100 * 0.05 +
      patternWeight * 0.1,
  );

  return {
    position: 0,
    companyId: input.companyId,
    companyName: input.companyName,
    qualificationScore: input.qualification.qualification_score_total,
    leadScore: input.lead.leadScore,
    rankingScore,
    bucket: input.lead.bucket,
    triggerStrength: input.qualification.trigger_strength_score,
    sourceConfidence: input.qualification.source_confidence_score,
    suggestedStructure: input.qualification.suggested_structure_type,
    rationale: `Ranking V2 pondera qualification, lead score, impactos de padrões, força de gatilho e confiança de fonte.`,
  };
};
