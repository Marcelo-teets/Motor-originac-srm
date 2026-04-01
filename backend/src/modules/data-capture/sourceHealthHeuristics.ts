export const inferSourceHealth = (params: {
  connectorStatus: 'real' | 'partial' | 'mock' | 'planned';
  confidenceScore: number;
  itemsCollected?: number;
}) => {
  if (params.connectorStatus === 'real' && params.confidenceScore >= 0.75) return 'healthy';
  if (params.connectorStatus === 'partial' || params.confidenceScore < 0.5 || (params.itemsCollected ?? 1) === 0) return 'degraded';
  if (params.connectorStatus === 'planned' || params.connectorStatus === 'mock') return 'down';
  return 'degraded';
};
