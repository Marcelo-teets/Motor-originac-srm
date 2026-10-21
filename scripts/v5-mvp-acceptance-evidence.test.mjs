import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateV5Acceptance, formatV5AcceptanceSummary } from './v5-mvp-acceptance-evidence.mjs';

const metrics = Object.freeze({
  active_admins: '0', fidc_human_reviews: '0', evidence_complete_companies: '0',
  candidates: '56', first_party_research_candidates: '4',
});
const sevenElapsed = () => Array.from({ length: 7 }, (_, n) => ({
  local_day: `2026-10-${String(18-n).padStart(2,'0')}`,
  successful_connector_runs: n === 0 ? 1 : 0,
  connector_outputs: n === 0 ? 1 : 0,
  monitoring_outputs: n === 0 ? 1 : 0,
}));

test('MVP is blocked by observed absence of human Auth and complete 7-day monitor, without inventing success', () => {
  const report = evaluateV5Acceptance({ metrics, monitoringDays: sevenElapsed() });
  assert.equal(report.status,'blocked');
  assert.deepEqual(report.gates.map(g => [g.gate, g.status]), [
    ['D-07','blocked'],['A2','blocked'],['A3-A5','blocked'],['A7','blocked'],
  ]);
  assert.match(formatV5AcceptanceSummary(report),/Não declarar 100%/);
  assert.equal(report.gates[2].evidence.candidateCount,56);
  assert.equal(report.gates[2].evidence.distinctCompaniesWithHumanCreditReviewAndCompleteGoldPipeline,0);
});

test('7-day monitor requires both actual successful connector runs AND outputs on every elapsed date', () => {
  const m={...metrics,active_admins:1,fidc_human_reviews:2,evidence_complete_companies:5};
  const fakeHealthy=sevenElapsed().map(d => ({...d,successful_connector_runs:1,connector_outputs:1,monitoring_outputs:1}));
  const accepted=evaluateV5Acceptance({metrics:m,monitoringDays:fakeHealthy});
  assert.equal(accepted.status,'awaiting_final_human_signoff');
  assert.ok(accepted.gates.every(g=>g.status==='verified'));
  const withoutConnector=evaluateV5Acceptance({metrics:m,monitoringDays:fakeHealthy.map((d,i)=>i===3?{...d,successful_connector_runs:0}:d)});
  assert.equal(withoutConnector.status,'blocked');
  const withoutOutput=evaluateV5Acceptance({metrics:m,monitoringDays:fakeHealthy.map((d,i)=>i===3?{...d,monitoring_outputs:0}:d)});
  assert.equal(withoutOutput.status,'blocked');
  const onlySix=evaluateV5Acceptance({metrics:m,monitoringDays:fakeHealthy.slice(0,6)});
  assert.equal(onlySix.status,'blocked');
});

test('MVP evaluator fails closed on stale or malformed metrics and duplicate daily records', () => {
  assert.throws(()=>evaluateV5Acceptance({metrics:{},monitoringDays:[]}),/Invalid metric: active_admins/);
  assert.throws(()=>evaluateV5Acceptance({metrics,monitoringDays:[{local_day:'2026-10-18',successful_connector_runs:-1,connector_outputs:0,monitoring_outputs:0}]}),/Invalid monitoring day counters/);
  const repeated=Array(7).fill({local_day:'2026-10-18',successful_connector_runs:1,connector_outputs:1,monitoring_outputs:1});
  assert.throws(()=>evaluateV5Acceptance({metrics,monitoringDays:repeated}),/Duplicate monitoring dates/);
});

test('candidate count alone is not equivalent to five finance-qualified opportunities', () => {
  const many={...metrics,candidates:10000,first_party_research_candidates:400,active_admins:1,fidc_human_reviews:100};
  const result=evaluateV5Acceptance({metrics:many,monitoringDays:[]});
  assert.equal(result.gates[2].status,'blocked');
  assert.equal(result.status,'blocked');
});

test('daily acceptance evidence workflow runs after its rollout and every day without modifying production', async () => {
  const { readFileSync } = await import('node:fs');
  const workflow = readFileSync(new URL('../.github/workflows/v5-daily-acceptance-evidence.yml', import.meta.url), 'utf8');
  assert.match(workflow, /^on:\s*\n\s+push:\s*\n\s+branches: \[main\]/m);
  assert.match(workflow, /\.github\/workflows\/v5-daily-acceptance-evidence\.yml/);
  assert.match(workflow, /cron: '13 13 \* \* \*'/);
  assert.match(workflow, /node scripts\/v5-mvp-acceptance-evidence\.mjs/);
  assert.match(workflow, /scripts\/v5-mvp-acceptance-evidence\.test\.mjs/);
  assert.match(workflow, /if-no-files-found: warn/);
  assert.doesNotMatch(workflow, /\bMOTOR_AUTH_BOOTSTRAP_ENABLED\b|\bINSERT INTO\b|\bUPDATE public\./);
});

test('A7 refuses seven healthy but non-consecutive dates', () => {
  const healthy = sevenElapsed().map(day => ({
    ...day, successful_connector_runs: 1, connector_outputs: 1, monitoring_outputs: 1,
  }));
  const withGap = healthy.map((day, index) =>
    index === 3 ? { ...day, local_day: '2026-10-08' } : day);
  const result = evaluateV5Acceptance({ metrics, monitoringDays: withGap });
  assert.equal(result.gates.find(gate => gate.gate === 'A7')?.status, 'blocked');
});

test('A7 rejects impossible calendar dates rather than silently slicing malformed input', () => {
  const invalidDays = sevenElapsed();
  invalidDays[0] = { ...invalidDays[0], local_day: '2026-02-30' };
  assert.throws(() => evaluateV5Acceptance({ metrics, monitoringDays: invalidDays }), /Invalid monitoring date/);
});

test('A7 only accepts outputs linked to successful connector runs from the same local date', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('./v5-mvp-acceptance-evidence.mjs', import.meta.url), 'utf8');
  assert.match(source, /join public\.source_connector_runs r on r\.id = m\.run_id/);
  assert.match(source, /r\.status = 'completed'/);
  assert.match(source, /r\.outputs_written > 0/);
  assert.match(source, /r\.started_at at time zone 'America\/Sao_Paulo'/);
});

test('production acceptance reports historical orphan output diagnostics without treating them as A7 evidence', () => {
  const withLineage = {
    ...metrics,
    total_connector_runs: '416',
    total_monitoring_outputs: '310',
    orphan_monitoring_outputs: '310',
    last_connector_started_at: '2026-10-19T20:18:04.960Z',
    last_output_captured_at: '2026-10-19T20:18:02.704Z',
  };
  const report = evaluateV5Acceptance({metrics:withLineage,monitoringDays:sevenElapsed()});
  assert.equal(report.diagnostics.totalConnectorRuns,416);
  assert.equal(report.diagnostics.totalMonitoringOutputs,310);
  assert.equal(report.diagnostics.outputsWithoutRunId,310);
  assert.equal(report.gates.find(g=>g.gate==='A7')?.status,'blocked');
  assert.match(formatV5AcceptanceSummary(report),/sem run_id: 310/);
  assert.ok(report.warnings.some(message=>message.includes('lack run_id')));
});

test('lineage diagnostics are queried read-only and cannot manufacture a successful A7 run', async () => {
  const {readFileSync}=await import('node:fs');
  const contents=readFileSync(new URL('./v5-mvp-acceptance-evidence.mjs',import.meta.url),'utf8');
  assert.match(contents,/from public\.monitoring_outputs where run_id is null/);
  assert.match(contents,/from public\.source_connector_runs\) as total_connector_runs/);
  assert.match(contents,/BEGIN TRANSACTION READ ONLY/);
});

test('D-07 requires a verified, unbanned Neon Auth identity linked to the active god_mode profile', async () => {
  const { readFileSync } = await import('node:fs');
  const sqlSource = readFileSync(new URL('./v5-mvp-acceptance-evidence.mjs', import.meta.url), 'utf8');
  assert.match(sqlSource, /join neon_auth\."user" u on u\.id = p\.id/);
  assert.match(sqlSource, /u\."emailVerified" = true/);
  assert.match(sqlSource, /coalesce\(u\.banned, false\) = false/);
  assert.match(sqlSource, /p\.role = 'god_mode'/);
  assert.match(sqlSource, /p\.status = 'active'/);
  assert.match(sqlSource, /lower\(btrim\(p\.email\)\) = lower\(btrim\(u\.email\)\)/);
});

test('A7 only counts confirmed real observed source-backed monitoring outputs, excluding partial and synthetic traces', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('./v5-mvp-acceptance-evidence.mjs',import.meta.url),'utf8');
  assert.match(source,/join public\.source_connector_runs r on r\.id = m\.run_id/);
  assert.match(source,/r\.status = 'completed'/);
  assert.match(source,/m\.connector_status = 'real'/);
  assert.match(source,/m\.status = 'processed'/);
  assert.match(source,/m\.observed_vs_inferred = 'observed'/);
  assert.match(source,/coalesce\(nullif\(btrim\(m\.url\), ''\), nullif\(btrim\(m\.evidence_url\), ''\)\) is not null/);
});

test('A2 counts only attributed source-backed reviews by a verified human user', async () => {
  const { readFileSync } = await import('node:fs');
  const s = readFileSync(new URL('./v5-mvp-acceptance-evidence.mjs', import.meta.url), 'utf8');
  assert.match(s,/from public\.fidc_assignor_human_reviews_v5 r/);
  assert.match(s,/join public\.user_profiles p on p\.id = r\.reviewer_user_id/);
  assert.match(s,/join neon_auth\."user" u on u\.id = p\.id/);
  assert.match(s,/p\.status = 'active'/);
  assert.match(s,/u\."emailVerified" = true/);
  assert.match(s,/lower\(btrim\(r\.reviewer_email\)\) = lower\(btrim\(u\.email\)\)/);
  assert.match(s,/char_length\(btrim\(r\.rationale\)\) >= 30/);
  assert.match(s,/char_length\(btrim\(r\.next_action\)\) >= 10/);
  assert.match(s,/r\.cvm_evidence_url like 'https:\/\/%'/);
});

test('A3-A5 needs verified CNPJ, provenance and human-approved credit evidence before counting a gold company', async () => {
  const {readFileSync}=await import('node:fs');
  const sql=readFileSync(new URL('./v5-mvp-acceptance-evidence.mjs',import.meta.url),'utf8');
  const block=sql.split('(select count(*) from public.companies c')[1]?.split(') as evidence_complete_companies')[0];
  assert.ok(block, 'gold company acceptance SQL block must exist');
  assert.match(block,/c\.cnpj_valid is true/);
  assert.match(block,/c\.source_trace <> '\{\}'::jsonb/);
  assert.match(block,/join public\.user_profiles p on p\.id = r\.reviewer_user_id/);
  assert.match(block,/join neon_auth\."user" u on u\.id = p\.id/);
  assert.match(block,/r\.reviewed_at is not null/);
  assert.match(block,/r\.evidence is not null/);
  assert.match(block,/r\.status='approved'/);
});

test('D-07 reports orphan Auth identity without approving access', () => {
 const report=evaluateV5Acceptance({metrics:{...metrics,auth_identity_count:'1',auth_identities_without_profile:'1',bootstrap_claims:'0'},monitoringDays:sevenElapsed()});
 assert.equal(report.gates.find(g=>g.gate==='D-07')?.status,'blocked');
 assert.equal(report.diagnostics.authIdentitiesWithoutProfile,1);
 assert.equal(report.diagnostics.bootstrapClaims,0);
 assert.match(formatV5AcceptanceSummary(report),/sem perfil institucional: 1/);
});
test('D-07 diagnostics never mutate Neon Auth or profiles',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('./v5-mvp-acceptance-evidence.mjs',import.meta.url),'utf8');
 assert.match(source,/from neon_auth\."user"\) as auth_identity_count/);
 assert.match(source,/from private\.auth_bootstrap_claim\) as bootstrap_claims/);
 assert.match(source,/BEGIN TRANSACTION READ ONLY/);
});

test('A7 daily counts only distinct completed direct capture runs carrying eligible output evidence', async () => {
  const { readFileSync } = await import('node:fs');
  const contents = readFileSync(new URL('./v5-mvp-acceptance-evidence.mjs', import.meta.url), 'utf8');
  const daysSql = contents.split('const DAYS_SQL = ')[1]?.split('export const collectV5Acceptance')[0];
  assert.ok(daysSql, 'Read-only A7 SQL must remain explicit');
  assert.match(daysSql, /join public\.source_connector_runs r on r\.id = m\.run_id/);
  assert.match(daysSql, /r\.scope_type = 'company'/);
  assert.match(daysSql, /r\.trigger_type = 'cron'/);
  assert.match(daysSql, /r\.status = 'completed'/);
  assert.match(daysSql, /r\.outputs_written > 0/);
  assert.match(daysSql, /m\.connector_status = 'real'/);
  assert.match(daysSql, /m\.status = 'processed'/);
  assert.match(daysSql, /m\.observed_vs_inferred = 'observed'/);
  assert.match(daysSql, /count\(distinct run_id\)::integer as successful_connector_runs/);
  assert.match(daysSql, /count\(output_id\)::integer as connector_outputs/);
  assert.match(daysSql, /count\(output_id\)::integer as monitoring_outputs/);
  assert.doesNotMatch(daysSql, /sum\(outputs_written\)/);
  assert.doesNotMatch(daysSql, /count\(\*\) filter \(where status = 'completed'\)/);
  assert.match(daysSql, /left join daily d on d\.local_day=c\.local_day/);
});

test('A7 acceptance still blocks a day with no real linked monitoring output despite audited run attempts', () => {
  const humanGates = {
    ...metrics, active_admins: '1', fidc_human_reviews: '1',
    evidence_complete_companies: '5',
  };
  const seven = sevenElapsed().map(day => ({
    ...day, successful_connector_runs: 2, connector_outputs: 2, monitoring_outputs: 2,
  }));
  seven[2] = {
    ...seven[2], successful_connector_runs: 0, connector_outputs: 0, monitoring_outputs: 0,
  };
  const report = evaluateV5Acceptance({ metrics: humanGates, monitoringDays: seven });
  assert.equal(report.gates.find(g => g.gate === 'A7')?.status, 'blocked');
  assert.equal(report.status, 'blocked');
});

test('A7 workflow reruns read-only acceptance on evaluator and regression changes', async () => {
  const { readFileSync } = await import('node:fs');
  const workflow = readFileSync(new URL('../.github/workflows/v5-daily-acceptance-evidence.yml', import.meta.url),'utf8');
  const pushScope = workflow.split('  push:')[1]?.split('  schedule:')[0];
  assert.ok(pushScope, 'daily evidence workflow must have a tracked push scope');
  for (const file of [
    '.github/workflows/v5-daily-acceptance-evidence.yml',
    'scripts/v5-mvp-acceptance-evidence.mjs',
    'scripts/v5-mvp-acceptance-evidence.test.mjs',
  ]) {
    assert.ok(pushScope.includes(file), 'Evidence must run after a change to ' + file);
  }
  assert.match(workflow, /cron: '13 13 \* \* \*'/);
  assert.match(workflow, /BEGIN TRANSACTION READ ONLY|node scripts\/v5-mvp-acceptance-evidence.mjs/);
  assert.doesNotMatch(workflow, /INSERT INTO|UPDATE public\.|MOTOR_AUTH_BOOTSTRAP_ENABLED/);
});
