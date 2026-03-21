import { leadScoreBuckets, leadScoreWeights } from '../../../config/scoring';

export const computeLeadScore = (input: {
  qualificationScore: number;
  sourceConfidence: number;
  triggerStrength: number;
  timingIntensity: number;
  executionReadiness: number;
  dataQuality: number;
  pipelineReadiness: number;
}) => {
  const score = Math.round(
    input.qualificationScore * leadScoreWeights.qualificationScore +
      input.sourceConfidence * 100 * leadScoreWeights.sourceConfidence +
      input.triggerStrength * leadScoreWeights.triggerStrength +
      input.timingIntensity * leadScoreWeights.timingIntensity +
      input.executionReadiness * leadScoreWeights.executionReadiness +
      input.dataQuality * leadScoreWeights.dataQuality +
      input.pipelineReadiness * leadScoreWeights.pipelineReadiness,
  );

  const bucket = leadScoreBuckets.find((item) => score >= item.min)?.label ?? 'low_priority';
  return { score, bucket };
};
