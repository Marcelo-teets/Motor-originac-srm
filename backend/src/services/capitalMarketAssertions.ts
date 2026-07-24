import type { CvmDatasetCode } from '../modules/capital-markets/cvmCapitalMarketConnector.js';

export type IngestionAssertionDataset = {
  datasetCode: CvmDatasetCode;
  status: 'completed' | 'partial' | 'failed';
  resourcesProcessed: number;
  resourcesSkipped: number;
  errors: string[];
};

export type DeliveryAssertionDataset = {
  datasetCode: CvmDatasetCode;
  status: 'completed' | 'failed';
  eventCount: number;
};

export type CapitalMarketAssertionResult = {
  ok: boolean;
  missingIngestionDatasets: CvmDatasetCode[];
  ingestionDatasetsWithErrors: CvmDatasetCode[];
  missingDeliveryDatasets: CvmDatasetCode[];
  failedDeliveryDatasets: CvmDatasetCode[];
  datasetsWithoutEvents: CvmDatasetCode[];
};

export const evaluateCapitalMarketDeliveryAssertions = (input: {
  requested: CvmDatasetCode[];
  ingestion: IngestionAssertionDataset[];
  delivery: DeliveryAssertionDataset[];
}): CapitalMarketAssertionResult => {
  const ingestionByCode = new Map(input.ingestion.map((dataset) => [dataset.datasetCode, dataset]));
  const deliveryByCode = new Map(input.delivery.map((dataset) => [dataset.datasetCode, dataset]));
  const missingIngestionDatasets = input.requested.filter((datasetCode) => !ingestionByCode.has(datasetCode));
  const ingestionDatasetsWithErrors = input.requested.filter((datasetCode) => {
    const dataset = ingestionByCode.get(datasetCode);
    if (!dataset) return false;
    // A scheduled no-op can be represented as partial when every resource was
    // skipped unchanged. It is valid only when there is no processing error.
    return dataset.status === 'failed' || dataset.errors.length > 0;
  });
  const missingDeliveryDatasets = input.requested.filter((datasetCode) => !deliveryByCode.has(datasetCode));
  const failedDeliveryDatasets = input.requested.filter((datasetCode) => (
    deliveryByCode.get(datasetCode)?.status === 'failed'
  ));
  const datasetsWithoutEvents = input.requested.filter((datasetCode) => {
    const dataset = deliveryByCode.get(datasetCode);
    return Boolean(dataset && dataset.eventCount <= 0);
  });

  const ok = missingIngestionDatasets.length === 0
    && ingestionDatasetsWithErrors.length === 0
    && missingDeliveryDatasets.length === 0
    && failedDeliveryDatasets.length === 0
    && datasetsWithoutEvents.length === 0;

  return {
    ok,
    missingIngestionDatasets,
    ingestionDatasetsWithErrors,
    missingDeliveryDatasets,
    failedDeliveryDatasets,
    datasetsWithoutEvents,
  };
};
