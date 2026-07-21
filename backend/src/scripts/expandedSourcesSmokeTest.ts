import { createPlatformRepository } from '../repositories/platformRepository.js';
import { env } from '../lib/env.js';
import { DataCaptureEngine } from '../modules/data-capture/dataCaptureEngine.js';

async function main() {
  const repo = createPlatformRepository(env.useSupabase ? 'supabase' : 'memory');
  const [companies, sources] = await Promise.all([repo.listCompanies(), repo.listSources()]);
  const target = companies.slice(0, 1);

  const engine = new DataCaptureEngine();
  const results = await engine.run(
    { scopeType: 'company', triggerType: 'manual', companyId: target[0]?.id },
    target,
    sources,
  );

  for (const result of results) {
    const outputsBySource = new Map<string, number>();
    for (const output of result.outputs) {
      const code = String(output.normalizedPayload.sourceCode ?? output.sourceId);
      outputsBySource.set(code, (outputsBySource.get(code) ?? 0) + 1);
    }

    console.log(JSON.stringify({
      companyId: result.run.companyId,
      status: result.run.status,
      outputs: result.outputs.length,
      signals: result.signals.length,
      enrichments: result.enrichments.length,
      outputsBySourceCode: Object.fromEntries(outputsBySource),
      diagnostics: result.run.diagnostics,
    }, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
