import { appendFile } from 'node:fs/promises';
import { closeNeonPool, query } from '../lib/neon-db.mjs';

try {
  const rows = await query('select * from public.source_schedule_coverage');
  const missing = rows.filter((row) => row.status !== 'retired' && row.schedule_status === 'missing_schedule');
  const invalid = rows.filter((row) => row.status !== 'retired' && (!row.workflow_file || !row.runner || !row.cadence));
  const blocked = rows.filter((row) => row.schedule_status === 'blocked_or_disabled');
  const scheduled = rows.filter((row) => row.schedule_status === 'scheduled');

  console.log(JSON.stringify({ total: rows.length, scheduled: scheduled.length, blocked: blocked.length, missing, invalid }, null, 2));

  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, [
      '## Source schedule coverage',
      '',
      `- Total: ${rows.length}`,
      `- Scheduled: ${scheduled.length}`,
      `- Blocked/disabled: ${blocked.length}`,
      `- Missing: ${missing.length}`,
      `- Invalid: ${invalid.length}`,
      '',
    ].join('\n'));
  }

  if (missing.length || invalid.length) process.exitCode = 1;
} finally {
  await closeNeonPool();
}
