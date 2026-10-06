import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ALL_JOBS, parseJobs, runJobs, SQL_JOBS } from './run-neon-scheduled-jobs.mjs';

test('job selection is explicit and validated', () => {
  assert.deepEqual(parseJobs([]), ['reprocessing', 'entity-resolution']);
  assert.deepEqual(parseJobs(['--jobs=agentetome,agentetome']), ['agentetome']);
  assert.throws(() => parseJobs(['--jobs=drop-everything']), /Unknown job/);
  assert.deepEqual([...ALL_JOBS].sort(), ['agentetome', 'entity-resolution', 'reprocessing']);
});

test('SQL jobs call the same functions the legacy pg_cron jobs scheduled', () => {
  assert.match(SQL_JOBS.reprocessing, /process_origination_reprocessing_queue\(25\)/);
  assert.match(SQL_JOBS['entity-resolution'], /auto_resolve_verified_candidate_entities_v4\(50\)/);
});

test('one failing job does not skip the others', async () => {
  const seen = [];
  const results = await runJobs(['reprocessing', 'entity-resolution', 'agentetome'], {
    query: async (sql) => {
      seen.push(sql);
      if (sql.includes('reprocessing')) throw new Error('lock timeout');
      return [{ ok: true }];
    },
    apiBaseUrl: 'https://motor.example',
    cronSecret: 's3cret',
    fetchImpl: async (url, init) => {
      assert.equal(String(url), 'https://motor.example/api/agentetome?operation=due-exports');
      assert.equal(init.headers.authorization, 'Bearer s3cret');
      return new Response('{"status":"real"}', { status: 200 });
    },
  });
  assert.equal(seen.length, 2);
  assert.deepEqual(results.map((result) => result.status), ['failed', 'completed', 'completed']);
});

test('HTTP jobs fail closed without the scheduler credentials', async () => {
  const [result] = await runJobs(['agentetome'], { query: async () => [] });
  assert.equal(result.status, 'failed');
  assert.match(result.error, /CRON_SECRET/);
});

test('the workflow schedules every job that pg_cron used to run', () => {
  const workflow = readFileSync(new URL('../.github/workflows/neon-scheduled-jobs.yml', import.meta.url), 'utf8');
  assert.match(workflow, /cron: '\*\/5 \* \* \* \*'/);
  assert.match(workflow, /cron: '17 \* \* \* \*'/);
  assert.match(workflow, /'\*\/5 \* \* \* \*'\) JOBS='reprocessing'/);
  assert.match(workflow, /'\*\/15 \* \* \* \*'\) JOBS='entity-resolution'/);
  assert.match(workflow, /'17 \* \* \* \*'\) JOBS='agentetome'/);
  assert.match(workflow, /node scripts\/run-neon-scheduled-jobs\.mjs/);
  assert.match(workflow, /secrets\.MOTOR_NEON_DATABASE_URL/);
  assert.match(workflow, /secrets\.CRON_SECRET/);
});
