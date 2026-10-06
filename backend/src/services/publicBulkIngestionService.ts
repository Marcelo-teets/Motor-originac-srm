import { getDataClient } from '../lib/dataClient.js';
import {
  discoverPublicBulkResources,
  streamPublicBulkResource,
  type PublicBulkDatasetCode,
  type PublicBulkRecord,
} from '../modules/public-data/publicBulkDatasetConnector.js';
import {
  PublicDatasetIngestionRunner,
  type DataClient,
  type PublicDatasetIngestionAdapter,
  type PublicDatasetIngestionOptions,
} from './publicDatasetIngestionRunner.js';

const sourceCodeFor = (dataset: PublicBulkDatasetCode) => ({
  rfb_cnpj: 'src_rfb_cnpj_bulk',
  pgfn_debt: 'src_pgfn_divida_ativa_bulk',
  bndes_financing_operations: 'src_bndes_financing_operations',
  cgu_ceis: 'src_cgu_transparencia_bulk',
  cgu_cnep: 'src_cgu_transparencia_bulk',
  compras_contracts: 'src_compras_gov_contracts',
})[dataset];

export type PublicBulkIngestionOptions = PublicDatasetIngestionOptions<PublicBulkDatasetCode>;

export const publicBulkIngestionAdapter: PublicDatasetIngestionAdapter<PublicBulkDatasetCode, PublicBulkRecord> = {
  missingClientMessage: 'Persistent data client not configured for public bulk ingestion.',
  noTargetsMessage: 'Company Master has no valid CNPJ targets.',
  partialImplementationPhase: 'bulk_loader_active_partial_coverage',
  sourceCodeFor,
  discover: (datasetCode, options) => discoverPublicBulkResources(datasetCode, options),
  stream: (input) => streamPublicBulkResource(input),
  loadTargetCnpjs: async (client) => {
    const rows = await client.select('companies', { select: 'id,cnpj', limit: 50_000 }) as Array<{ id: string; cnpj: string | null }>;
    return new Set(rows.map((row) => String(row.cnpj ?? '').replace(/\D/g, '')).filter((cnpj) => cnpj.length === 14));
  },
  syncOutputs: async (client, datasetCode) => {
    const synced = await client.rpc<{ outputs_written?: number; signals_written?: number }>(
      'sync_public_dataset_company_outputs',
      { p_dataset_code: datasetCode },
    );
    return {
      outputsWritten: Number(synced?.outputs_written ?? 0),
      signalsWritten: Number(synced?.signals_written ?? 0),
    };
  },
};

export class PublicBulkIngestionService {
  private readonly runner: PublicDatasetIngestionRunner<PublicBulkDatasetCode, PublicBulkRecord>;

  constructor(client: DataClient | null = getDataClient()) {
    this.runner = new PublicDatasetIngestionRunner(client, publicBulkIngestionAdapter);
  }

  run(options: PublicBulkIngestionOptions) {
    return this.runner.run(options);
  }
}
