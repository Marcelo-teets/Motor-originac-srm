import { clamp } from './helpers.js';
import type { CompanyPattern, LeadScoreSnapshot, QualificationSnapshot, RankingRow } from '../types/platform.js';

type PublicEvidence = {
  opportunityScore?: number;
  riskPenalty?: number;
  blockingRiskCount?: number;
  riskLevel?: string;
};

export const buildRankingRow = (input: {
  companyId: string;
  companyName: string;
  qualification: QualificationSnapshot;
  lead: LeadScoreSnapshot;
  patterns: CompanyPattern[];
}): RankingRow => {
  const patternWeight = input.patterns.reduce((sum, pattern) => sum + pattern.rankingImpact, 0);
  const publicEvidence = (input.qualification.evidence_payload?.publicEvidence ?? {}) as PublicEvidence;
  const opportunityBonus = Number(publicEvidence.opportunityScore ?? 0) * 0.1;
  const riskPenalty = Number(publicEvidence.riskPenalty ?? 0) * 0.28;
  const baseRankingScore = clamp(
    input.qualification.qualification_score_total * 0.4 +
      input.lead.leadScore * 0.35 +
      input.qualification.trigger_strength_score * 0.1 +
      input.qualification.source_confidence_score * 100 * 0.05 +
      patternWeight * 0.1 +
      opportunityBonus -
      riskPenalty,
  );
  const rankingScore = Number(publicEvidence.blockingRiskCount ?? 0) > 0
    ? Math.min(baseRankingScore, 54)
    : publicEvidence.riskLevel === 'high' ? Math.min(baseRankingScore, 69) : baseRankingScore;

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
    rationale: `Ranking V2 pondera qualification, lead score, padrões, timing e confiança; evidência pública adiciona bônus ${opportunityBonus.toFixed(1)} e penalidade ${riskPenalty.toFixed(1)} (risco ${publicEvidence.riskLevel ?? 'none'}).`,
  };
};
