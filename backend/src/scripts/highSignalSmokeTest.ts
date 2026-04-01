import { createPlatformRepository } from '../repositories/platformRepository.js';
import { env } from '../lib/env.js';
import { ingestCompanyMonitoring } from '../lib/connectors.runtime.highSignal.js';

async function main() {
  const repo = createPlatformRepository(env.useSupabase ? 'supabase' : 'memory');
  const [companies, sources] = await Promise.all([repo.listCompanies(), repo.listSources()]);
  const target = companies.slice(0, 3);

  for (const company of target) {
    const result = await ingestCompanyMonitoring(company, sources);
    console.log(JSON.stringify({
      companyId: company.id,
      companyName: company.tradeName,
      outputs: result.outputs.length,
      signals: result.signals.length,
      enrichments: result.enrichments.length,
      topSignals: result.signals.slice(0, 10).map((signal) => ({ type: signal.signalType, strength: signal.signalStrength, sourceId: signal.sourceId })),
    }, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
