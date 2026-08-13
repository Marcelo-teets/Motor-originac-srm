import {
  fetchCvmResourceRecords,
  type CvmDatasetCode,
  type CvmResource,
  type NormalizedCapitalMarketRecord,
} from './cvmCapitalMarketConnector.js';
import { fetchDebenturesSndSnapshot } from './debenturesSndHttp.js';
import { normalizeDebenturesSndRow } from './debenturesSndNormalizer.js';

export const fetchCapitalMarketResourceRecords = async (input: {
  datasetCode: CvmDatasetCode;
  resource: CvmResource;
  maxRows: number;
  observedAt?: string;
}): Promise<NormalizedCapitalMarketRecord[]> => {
  if (input.datasetCode !== 'debentures_snd') return fetchCvmResourceRecords(input);
  const observedAt = input.observedAt ?? new Date().toISOString();
  const snapshot = await fetchDebenturesSndSnapshot(input.resource.url);
  return snapshot.rows
    .slice(0, input.maxRows)
    .map((row) => normalizeDebenturesSndRow(row, input.resource.url, snapshot.generatedDate, observedAt));
};
