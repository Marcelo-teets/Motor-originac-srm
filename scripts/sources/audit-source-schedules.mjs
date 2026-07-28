const baseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!baseUrl || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');

const response = await fetch(`${baseUrl}/rest/v1/source_schedule_coverage?select=*`, {
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
});
if (!response.ok) throw new Error(`Schedule coverage query failed with ${response.status}: ${(await response.text()).slice(0, 500)}`);
const rows = await response.json();
const missing = rows.filter((row) => row.status !== 'retired' && row.schedule_status === 'missing_schedule');
const invalid = rows.filter((row) => row.status !== 'retired' && (!row.workflow_file || !row.runner || !row.cadence));
const blocked = rows.filter((row) => row.schedule_status === 'blocked_or_disabled');
const scheduled = rows.filter((row) => row.schedule_status === 'scheduled');

console.log(JSON.stringify({ total: rows.length, scheduled: scheduled.length, blocked: blocked.length, missing, invalid }, null, 2));

if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFile } = await import('node:fs/promises');
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
