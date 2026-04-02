export const buildRunSummary = (params: {
  companiesProcessed: number;
  outputsWritten: number;
  signalsWritten: number;
  enrichmentsWritten: number;
  sourceDocumentsWritten?: number;
}) => ({
  companiesProcessed: params.companiesProcessed,
  outputsWritten: params.outputsWritten,
  signalsWritten: params.signalsWritten,
  enrichmentsWritten: params.enrichmentsWritten,
  sourceDocumentsWritten: params.sourceDocumentsWritten ?? 0,
  healthLabel: params.outputsWritten > 0 ? 'productive' : 'low_output',
});
