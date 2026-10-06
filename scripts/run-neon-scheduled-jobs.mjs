// Neon replacement for the legacy pg_cron jobs (Neon only allows pg_cron in the
// "postgres" database, and the Motor runtime lives in "neondb").
//
//   origination-derived-reprocessing      */5  -> public.process_origination_reprocessing_queue(25)
//   candidate-automatic-entity-resolution */15 -> public.auto_resolve_verified_candidate_entities_v4(50)
//   agentetome-due-export-refresh         :17  -> POST /api/agentetome?operation=due-exports (Vercel)
//
// Usage: node scripts/run-neon-scheduled-jobs.mjs --jobs=reprocessing,entity-resolution[,agentetome]
// Each job is isolated: one failure does not skip the others, and the process
// exits non-zero only after every requested job ran.
import { pathToFileURL } from 'node:url';

export const SQL_JOBS = Object.freeze({
  reprocessing: 'select * from public.process_origination_reprocessing_queue(25)',
  'entity-resolution': 'select * from public.auto_resolve_verified_candidate_entities_v4(50)',
});
export const HTTP_JOBS = Object.freeze({
  agentetome: '/api/agentetome?operation=due-exports',
});
export const ALL_JOBS = Object.freeze([...Object.keys(SQL_JOBS), ...Object.keys(HTTP_JOBS)]);

export const parseJobs = (argv) => {
  const raw = argv.find((arg) => arg.startsWith('--jobs='))?.slice('--jobs='.length) ?? 'reprocessing,entity-resolution';
  const jobs = raw.split(',').map((job) => job.trim()).filter(Boolean);
  const unknown = jobs.filter((job) => !ALL_JOBS.includes(job));
  if (unknown.length) throw new Error(`Unknown job(s): ${unknown.join(', ')}. Known: ${ALL_JOBS.join(', ')}`);
  return [...new Set(jobs)];
};

export const runJobs = async (jobs, { query, fetchImpl = fetch, apiBaseUrl = '', cronSecret = '' }) => {
  const results = [];
  for (const job of jobs) {
    const startedAt = Date.now();
    try {
      if (SQL_JOBS[job]) {
        const rows = await query(SQL_JOBS[job]);
        results.push({ job, status: 'completed', rows: rows.length, durationMs: Date.now() - startedAt });
        continue;
      }
      if (!apiBaseUrl || !cronSecret) throw new Error('MOTOR_API_BASE_URL and CRON_SECRET are required for HTTP jobs.');
      const response = await fetchImpl(new URL(HTTP_JOBS[job], apiBaseUrl), {
        method: 'POST',
        headers: { authorization: `Bearer ${cronSecret}`, accept: 'application/json' },
        signal: AbortSignal.timeout(295_000),
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 500)}`);
      results.push({ job, status: 'completed', httpStatus: response.status, durationMs: Date.now() - startedAt, body: body.slice(0, 2000) });
    } catch (error) {
      results.push({ job, status: 'failed', error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - startedAt });
    }
  }
  return results;
};

const main = async () => {
  const jobs = parseJobs(process.argv.slice(2));
  const needsDb = jobs.some((job) => SQL_JOBS[job]);
  const db = needsDb ? await import('./lib/neon-db.mjs') : null;
  try {
    const results = await runJobs(jobs, {
      query: db ? db.query : async () => [],
      apiBaseUrl: process.env.MOTOR_API_BASE_URL ?? '',
      cronSecret: process.env.CRON_SECRET ?? '',
    });
    for (const result of results) console.log(JSON.stringify(result));
    if (results.some((result) => result.status === 'failed')) process.exitCode = 1;
  } finally {
    await db?.closeNeonPool();
  }
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
