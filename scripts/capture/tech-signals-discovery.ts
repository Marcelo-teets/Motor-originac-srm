import { syncTechSignalsDiscoveryCandidates } from '../../backend/src/lib/techSignalsDiscovery.js';

const main = async () => {
  const feedUrl = process.env.TECH_SIGNALS_LATAM_FEED_URL || 'https://pedrobmesquita.substack.com/feed';
  const summary = await syncTechSignalsDiscoveryCandidates({ feedUrl });
  console.log(JSON.stringify({
    source: 'src_tech_signals_latam',
    feedUrl,
    scannedEntries: summary.scannedEntries,
    discovered: summary.discovered,
    existingCompanies: summary.existingCompanies,
    existingCandidates: summary.existingCandidates,
    insertedCandidates: summary.insertedCandidates,
    updatedCandidates: summary.updatedCandidates,
  }, null, 2));
};

main().catch((error) => {
  console.error('[tech-signals-discovery] failed', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
