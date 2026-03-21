export const qualificationWeights = {
  structural: 20,
  receivables: 20,
  capitalStructure: 25,
  execution: 20,
  timing: 15,
};

export const leadScoreWeights = {
  qualificationScore: 0.3,
  sourceConfidence: 0.1,
  triggerStrength: 0.15,
  timingIntensity: 0.15,
  executionReadiness: 0.1,
  dataQuality: 0.1,
  pipelineReadiness: 0.1,
};

export const leadScoreBuckets = [
  { min: 85, label: 'immediate_priority' },
  { min: 70, label: 'high_priority' },
  { min: 55, label: 'monitor_closely' },
  { min: 40, label: 'watchlist' },
  { min: 0, label: 'low_priority' },
];
