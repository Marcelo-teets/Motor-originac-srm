import type { MonitoringOutput } from '../../types/platform.js';

export const mapMonitoringOutputSummary = (output: MonitoringOutput) => ({
  id: output.id,
  companyId: output.companyId,
  sourceId: output.sourceId,
  collectedAt: output.collectedAt,
  confidenceScore: output.confidenceScore,
  connectorStatus: output.connectorStatus,
  title: output.title,
  summary: output.summary,
});

export const mapMonitoringOutputsSummary = (outputs: MonitoringOutput[]) => outputs.map(mapMonitoringOutputSummary);
