import { leadScoreBuckets, leadScoreWeights, qualificationWeights } from '../../../config/scoring.js';
import { clamp } from './helpers.js';

export const computeLeadScore = (input: {
  qualificationScore: number;
  sourceConfidence: number;
  triggerStrength: number;
  timingIntensity: number;
  executionReadiness: number;
  dataQuality: number;
  pipelineReadiness: number;
  patternScore: number;
}) => {
  const score = clamp(
    input.qualificationScore * leadScoreWeights.qualificationScore +
      input.sourceConfidence * 100 * leadScoreWeights.sourceConfidence +
      input.triggerStrength * leadScoreWeights.triggerStrength +
      input.timingIntensity * leadScoreWeights.timingIntensity +
      input.executionReadiness * leadScoreWeights.executionReadiness +
      input.dataQuality * leadScoreWeights.dataQuality +
      input.pipelineReadiness * leadScoreWeights.pipelineReadiness +
      input.patternScore * 0.1,
  );

  const bucket = leadScoreBuckets.find((item) => score >= item.min)?.label ?? 'low_priority';
  return { score, bucket };
};

export const qualificationWeightTotal = Object.values(qualificationWeights).reduce((sum, value) => sum + value, 0);
