import { getDataClient } from '../lib/dataClient.js';
import {
  discoverStrategicPublicResources,
  streamStrategicPublicResource,
  type StrategicPublicDatasetCode,
  type StrategicPublicRecord,
} from '../modules/public-data/strategicPublicDatasetConnector.js';
import {
  PublicDatasetIngestionRunner,
  type DataClient,
  type PublicDatasetIngestionAdapter,
  type PublicDatasetIngestionOptions,
} from './publicDatasetIngestionRunner.js';

const TARGET_ELIGIBILITY_POLICY = 'real_identity_verified_monitoring_v1';
const CONNECTOR_FAMILY = 'strategic_public_sources_v1';

const sourceCodeFor = (dataset: StrategicPublicDatasetCode) => ({
  rfb_qsa: 'src_rfb_qsa_bulk',
  cvm_fre_capital_structure: 'src_cvm_fre_capital_structure',
})[dataset];

export type StrategicPublicIngestionOptions = PublicDatasetIngestionOptions<StrategicPublicDatasetCode>;

export type StrategicTargetCompanyRow = {
  id: string;
  cnpj: string | null;
  metadata?: Record<string, unknown> | null;
};

export const normalizeCnpj = (value: unknown) => String(value ?? '').replace(/\D/g, '');

export const isValidCnpj = (value: unknown) => {
  const digits = normalizeCnpj(value);
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;

  const calculateDigit = (base: string, weights: number[]) => {
    const sum = base.split('').reduce((total, digit, index) => total + Number(digit) * weights[index]!, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const first = calculateDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = calculateDigit(`${digits.slice(0, 12)}${first}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits.endsWith(`${first}${second}`);
};

export const isEligibleStrategicMonitoringTarget = (row: StrategicTargetCompanyRow) => {
  const metadata = row.metadata ?? {};
  return isValidCnpj(row.cnpj)
    && metadata.data_status === 'real'
    && metadata.synthetic_seed !== true
    && metadata.identity_verified === true
    && metadata.monitoring_eligible === true
    && metadata.excluded_from_monitoring !== true
    && metadata.entity_resolution_eligible !== false;
};

export const strategicPublicIngestionAdapter: PublicDatasetIngestionAdapter<StrategicPublicDatasetCode, StrategicPublicRecord> = {
  missingClientMessage: 'Persistent data client not configured for strategic public-data ingestion.',
  noTargetsMessage: 'Company Master has no real, identity-verified, monitoring-eligible CNPJ targets.',
  partialImplementationPhase: 'loader_active_partial_coverage',
  runMetadata: { targetEligibilityPolicy: TARGET_ELIGIBILITY_POLICY, connectorFamily: CONNECTOR_FAMILY },
  checkpointMetadata: { connectorFamily: CONNECTOR_FAMILY },
  sourceMetadata: (targetCompanyCount) => ({
    targetEligibilityPolicy: TARGET_ELIGIBILITY_POLICY,
    lastTargetCompanyCount: targetCompanyCount,
  }),
  sourceCodeFor,
  discover: (datasetCode, options) => discoverStrategicPublicResources(datasetCode, options),
  stream: (input) => streamStrategicPublicResource(input),
  loadTargetCnpjs: async (client) => {
    const rows = await client.select('companies', {
      select: 'id,cnpj,metadata',
      limit: 50_000,
    }) as StrategicTargetCompanyRow[];
    return new Set(rows.filter(isEligibleStrategicMonitoringTarget).map((row) => normalizeCnpj(row.cnpj)));
  },
  syncOutputs: async (client, datasetCode) => {
    const genericSync = await client.rpc<{ outputs_written?: number; signals_written?: number }>(
      'sync_public_dataset_company_outputs',
      { p_dataset_code: datasetCode },
    );
    const strategicSync = await client.rpc<{ signals_written?: number }>(
      'sync_strategic_dataset_company_signals',
      { p_dataset_code: datasetCode },
    );
    return {
      outputsWritten: Number(genericSync?.outputs_written ?? 0),
      signalsWritten: Number(genericSync?.signals_written ?? 0) + Number(strategicSync?.signals_written ?? 0),
    };
  },
};

export class StrategicPublicIngestionService {
  private readonly runner: PublicDatasetIngestionRunner<StrategicPublicDatasetCode, StrategicPublicRecord>;

  constructor(client: DataClient | null = getDataClient()) {
    this.runner = new PublicDatasetIngestionRunner(client, strategicPublicIngestionAdapter);
  }

  run(options: StrategicPublicIngestionOptions) {
    return this.runner.run(options);
  }
}
