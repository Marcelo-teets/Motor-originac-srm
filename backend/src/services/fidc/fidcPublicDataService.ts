import { fetchCvmFidcInformeMensalPackage } from '../../lib/connectors/fidc/cvmOpenDataDatasets.js';

export class FidcPublicDataService {
  async getCatalogSnapshot() {
    const cvm = await fetchCvmFidcInformeMensalPackage().catch(() => null);

    return {
      cvmDataset: cvm,
      generatedAt: new Date().toISOString(),
    };
  }
}
