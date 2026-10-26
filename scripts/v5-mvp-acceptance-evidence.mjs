import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

// Acceptance evidence, NEVER an automatic business approval. Values come from
// read-only SELECTs on the canonical production Neon database.
export const evaluateV5Acceptance = ({ metrics, monitoringDays }, minimumQualified = 5) => {
  assert.ok(metrics && typeof metrics === 'object', 'Production metrics are required');
  assert.ok(Array.isArray(monitoringDays), 'Production daily monitoring history is required');
  const count = (key) => {
    const value = Number(metrics[key] ?? NaN);
    assert.ok(Number.isSafeInteger(value) && value >= 0, `Invalid metric: ${key}`);
    return value;
  };
  const guard = (key, passed, evidence) => ({ gate: key, status: passed ? 'verified' : 'blocked', evidence });
  const administratorCount = count('active_admins');
  const humanReviewCount = count('fidc_human_reviews');
  const goldQualifiedCount = count('evidence_complete_companies');
  // Diagnostics describe observed lineage debt without granting any acceptance gate.
  const diagnosticCount = (key) => metrics[key] === undefined || metrics[key] === null
    ? null : count(key);
  const diagnostics = {
    totalConnectorRuns: diagnosticCount('total_connector_runs'),
    authIdentityCount: diagnosticCount('auth_identity_count'),
    authIdentitiesWithoutProfile: diagnosticCount('auth_identities_without_profile'),
    bootstrapClaims: diagnosticCount('bootstrap_claims'),
    totalMonitoringOutputs: diagnosticCount('total_monitoring_outputs'),
    outputsWithoutRunId: diagnosticCount('orphan_monitoring_outputs'),
    datasetOutputsWithoutRunId: diagnosticCount('dataset_outputs_without_run_id'),
    datasetOutputsWithSourcePointer: diagnosticCount('dataset_outputs_with_provenance_pointer'),
    captureOutputsWithoutRunId: diagnosticCount('capture_outputs_without_run_id'),
    lastConnectorStartedAt: metrics.last_connector_started_at ?? null,
    lastOutputCapturedAt: metrics.last_output_captured_at ?? null,
  };
  if (diagnostics.outputsWithoutRunId !== null
    && diagnostics.datasetOutputsWithoutRunId !== null
    && diagnostics.captureOutputsWithoutRunId !== null) {
    assert.equal(
      diagnostics.datasetOutputsWithoutRunId + diagnostics.captureOutputsWithoutRunId,
      diagnostics.outputsWithoutRunId,
      'Lineage diagnostics must partition all missing run_id outputs',
    );
  }
  if (diagnostics.datasetOutputsWithoutRunId !== null && diagnostics.datasetOutputsWithSourcePointer !== null) {
    assert.ok(
      diagnostics.datasetOutputsWithSourcePointer <= diagnostics.datasetOutputsWithoutRunId,
      'Source-backed dataset count cannot exceed dataset output count',
    );
  }
  const normalizedDays = monitoringDays.map((row) => {
    const sourceRuns = Number(row.successful_connector_runs);
    const connectorOutputs = Number(row.connector_outputs);
    const monitoringOutputs = Number(row.monitoring_outputs);
    assert.ok([sourceRuns, connectorOutputs, monitoringOutputs].every(v => Number.isSafeInteger(v) && v >= 0),
      'Invalid monitoring day counters');
    const localDate = String(row.local_day);
    assert.match(localDate, /^\d{4}-\d{2}-\d{2}$/, 'Invalid monitoring date');
    const utcMidnight = Date.parse(`${localDate}T00:00:00.000Z`);
    assert.ok(Number.isFinite(utcMidnight) && new Date(utcMidnight).toISOString().slice(0, 10) === localDate,
      'Invalid monitoring date');
    return {
      date: localDate,
      successfulConnectorRuns: sourceRuns,
      connectorOutputs,
      monitoringOutputs,
      healthy: sourceRuns > 0 && connectorOutputs > 0 && monitoringOutputs > 0,
    };
  });
  const dates = normalizedDays.map((d) => d.date);
  assert.equal(new Set(dates).size, dates.length, 'Duplicate monitoring dates');
  const sortedDayStarts = dates.map(date => Date.parse(`${date}T00:00:00.000Z`)).sort((a, b) => a - b);
  const consecutiveCalendarDays = sortedDayStarts.length === 7
    && sortedDayStarts.every((dayStart, index) => index === 0 || dayStart - sortedDayStarts[index - 1] === 86400000);
  const continuous = consecutiveCalendarDays && normalizedDays.every(d => d.healthy);
  const gates = [
    guard('D-07', administratorCount >= 1, { activeAdministrativeProfiles: administratorCount }),
    guard('A2', humanReviewCount >= 1, { auditRecordedByHumans: humanReviewCount }),
    guard('A3-A5', goldQualifiedCount >= minimumQualified, {
      distinctCompaniesWithHumanCreditReviewAndCompleteGoldPipeline: goldQualifiedCount,
      minimumQualified,
      candidateCount: count('candidates'),
      sourceBackedResearchCandidates: count('first_party_research_candidates'),
    }),
    guard('A7', continuous, { completedMonitoringDays: normalizedDays, consecutiveRequired: 7 }),
  ];
  return {
    schema: 'motor.v5.acceptance-evidence.1',
    status: gates.every(x => x.status === 'verified') ? 'awaiting_final_human_signoff' : 'blocked',
    gates,
    diagnostics,
    warnings: [
      'Counts do not establish opportunity quality; human credit review and final institutional signoff remain mandatory.',
      ...(diagnostics.authIdentitiesWithoutProfile !== null && diagnostics.authIdentitiesWithoutProfile > 0
        ? [`${diagnostics.authIdentitiesWithoutProfile} Neon Auth identities have no institutional profile. D-07 requires the controlled human bootstrap procedure.`]
        : []),
      ...(administratorCount === 0 && diagnostics.authIdentityCount === 0 && diagnostics.bootstrapClaims === 0
        ? ['D-07 initial administrator is not enrolled. The bootstrap must be attended by the authorized person and switched off immediately after enrollment.']
        : []),
      ...(diagnostics.captureOutputsWithoutRunId !== null && diagnostics.captureOutputsWithoutRunId > 0
        ? [`${diagnostics.captureOutputsWithoutRunId} capture outputs lack run_id and cannot satisfy A7 lineage; inspect capture origin before any backfill.`]
        : []),
      ...(diagnostics.datasetOutputsWithoutRunId !== null
        && diagnostics.datasetOutputsWithSourcePointer !== null
        && diagnostics.datasetOutputsWithSourcePointer < diagnostics.datasetOutputsWithoutRunId
        ? [`${diagnostics.datasetOutputsWithoutRunId - diagnostics.datasetOutputsWithSourcePointer} public dataset outputs lack a source and record-key pointer; review provenance.`]
        : []),
    ],
  };
};

const METRICS_SQL = `
select
 (select count(*) from public.user_profiles p
   join neon_auth."user" u on u.id = p.id
   where p.status = 'active'
     and p.role = 'god_mode'
     and u."emailVerified" = true
     and coalesce(u.banned, false) = false
     and lower(btrim(p.email)) = lower(btrim(u.email))
 ) as active_admins,
 (select count(*) from public.fidc_assignor_human_reviews_v5 r
   join public.user_profiles p on p.id = r.reviewer_user_id
   join neon_auth."user" u on u.id = p.id
   where p.status = 'active'
     and u."emailVerified" = true
     and coalesce(u.banned, false) = false
     and lower(btrim(r.reviewer_email)) = lower(btrim(u.email))
     and char_length(btrim(r.rationale)) >= 30
     and char_length(btrim(r.next_action)) >= 10
     and r.cvm_evidence_url like 'https://%'
 ) as fidc_human_reviews,
 (select count(*) from public.discovered_company_candidates) as candidates,
 (select count(*) from public.source_connector_runs) as total_connector_runs,
 (select count(*) from neon_auth."user") as auth_identity_count,
 (select count(*) from neon_auth."user" au where not exists (select 1 from public.user_profiles up where up.id::text = au.id::text)) as auth_identities_without_profile,
 (select count(*) from private.auth_bootstrap_claim) as bootstrap_claims,
 (select count(*) from public.monitoring_outputs) as total_monitoring_outputs,
 (select count(*) from public.monitoring_outputs where run_id is null) as orphan_monitoring_outputs,
 (select count(*) from public.monitoring_outputs
   where run_id is null and output_type = 'public_dataset_record'
 ) as dataset_outputs_without_run_id,
 (select count(*) from public.monitoring_outputs
   where run_id is null and output_type = 'public_dataset_record'
     and source_id is not null
     and nullif(btrim(payload->>'publicRecordKey'), '') is not null
     and coalesce(nullif(btrim(url), ''), nullif(btrim(evidence_url), '')) is not null
 ) as dataset_outputs_with_provenance_pointer,
 (select count(*) from public.monitoring_outputs
   where run_id is null and output_type is distinct from 'public_dataset_record'
 ) as capture_outputs_without_run_id,
 (select max(started_at) from public.source_connector_runs) as last_connector_started_at,
 (select max(captured_at) from public.monitoring_outputs) as last_output_captured_at,
 (select count(*) from public.discovered_company_candidates where metadata->>'researchCohort'='fidc_dcm_first_party_credit_v5') as first_party_research_candidates,
 (select count(*) from public.companies c
   where c.cnpj_valid is true
     and c.source_trace is not null
     and jsonb_typeof(c.source_trace) in ('object', 'array')
     and c.source_trace <> '{}'::jsonb
     and c.source_trace <> '[]'::jsonb
     and exists (select 1 from public.company_credit_reviews r
       join public.user_profiles p on p.id = r.reviewer_user_id
       join neon_auth."user" u on u.id = p.id
       where r.company_id=c.id and r.status='approved'
         and r.reviewed_at is not null
         and p.status='active'
         and u."emailVerified" = true
         and coalesce(u.banned, false)=false
         and char_length(btrim(r.rationale)) >= 30
         and char_length(btrim(r.next_action)) >= 10
         and r.evidence is not null
         and r.evidence <> '{}'::jsonb
         and r.evidence <> '[]'::jsonb
         and r.evidence <> 'null'::jsonb
     )
     and exists (select 1 from public.qualification_snapshots q where q.company_id=c.id)
     and exists (select 1 from public.company_patterns p where p.company_id=c.id)
     and exists (select 1 from public.score_snapshots s where s.company_id=c.id)
     and exists (select 1 from public.lead_score_snapshots l where l.company_id=c.id)
     and exists (select 1 from public.thesis_outputs t where t.company_id=c.id)
     and exists (select 1 from public.ranking_v2 rk where rk.company_id=c.id)
     and exists (select 1 from public.pipeline pl where pl.company_id=c.id)
 ) as evidence_complete_companies
`;

// Seven fully elapsed São Paulo calendar days. The current partial day is excluded.
const DAYS_SQL = `
with calendar as (
 select ((now() at time zone 'America/Sao_Paulo')::date - (n + 1)) as local_day
 from generate_series(0,6) as series(n)
), eligible as (
 -- One evidence-backed output has exactly one originating persisted run.
 -- The direct GitHub runner also writes a separate audit row: that row
 -- carries reported outputs_written but no linked monitoring_outputs and
 -- must NEVER inflate completed runs or the A7 output counters.
 select (m.captured_at at time zone 'America/Sao_Paulo')::date as local_day,
        r.id as run_id, m.id as output_id
 from public.monitoring_outputs m
 join public.source_connector_runs r on r.id = m.run_id
   and r.scope_type = 'company'
   and r.trigger_type = 'cron'
   and r.status = 'completed'
   and r.outputs_written > 0
   and m.connector_status = 'real'
   and m.status = 'processed'
   and m.observed_vs_inferred = 'observed'
   and coalesce(nullif(btrim(m.url), ''), nullif(btrim(m.evidence_url), '')) is not null
   and (r.started_at at time zone 'America/Sao_Paulo')::date
     = (m.captured_at at time zone 'America/Sao_Paulo')::date
), daily as (
 select local_day,
        count(distinct run_id)::integer as successful_connector_runs,
        count(output_id)::integer as connector_outputs,
        count(output_id)::integer as monitoring_outputs
 from eligible
 group by 1
)
select c.local_day::text as local_day,
 coalesce(d.successful_connector_runs,0)::integer as successful_connector_runs,
 coalesce(d.connector_outputs,0)::integer as connector_outputs,
 coalesce(d.monitoring_outputs,0)::integer as monitoring_outputs
from calendar c
left join daily d on d.local_day=c.local_day
order by c.local_day desc
`;

export const collectV5Acceptance = async (connectionString) => {
  assert.ok(typeof connectionString === 'string' && connectionString.length > 0, 'Neon production connection required');
  const parsed = new URL(connectionString);
  assert.ok(parsed.hostname.endsWith('.neon.tech'), 'Refusing non-Neon production database');
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000, statement_timeout: 15000 });
  await client.connect();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    const [metrics, monitoringDays] = [
      (await client.query(METRICS_SQL)).rows[0],
      (await client.query(DAYS_SQL)).rows,
    ];
    await client.query('COMMIT');
    return evaluateV5Acceptance({ metrics, monitoringDays });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { await client.end(); }
};

export const formatV5AcceptanceSummary = (report) => [
  '## Motor V5 — evidências reais de aceite',
  '',
  `Estado: **${report.status}**. Este relatório não aprova empresas nem substitui revisão humana.`,
  '',
  '| Gate | Situação | Evidência |',
  '| --- | --- | --- |',
  ...report.gates.map(g => `| ${g.gate} | ${g.status} | ${JSON.stringify(g.evidence).replaceAll('|', '/')} |`),
  '',
  '### Diagnóstico de Auth e bootstrap (não cria usuários)',
  `Identidades Neon Auth: ${report.diagnostics?.authIdentityCount ?? 'indisponível'}; sem perfil institucional: ${report.diagnostics?.authIdentitiesWithoutProfile ?? 'indisponível'}; reivindicações bootstrap: ${report.diagnostics?.bootstrapClaims ?? 'indisponível'}.`,
  'Ativação humana: consultar docs/AUTH_USER_PROFILES_RUNBOOK.md e RB-03 em docs/project-control/v5/RUNBOOKS_OPERACAO_V5.md.',
  '',
  '### Diagnóstico de rastreabilidade (não concede aprovação)',
  `Execuções registradas: ${report.diagnostics?.totalConnectorRuns ?? 'indisponível'}; outputs: ${report.diagnostics?.totalMonitoringOutputs ?? 'indisponível'}; sem run_id: ${report.diagnostics?.outputsWithoutRunId ?? 'indisponível'}.`,
  `Sem run_id por origem: registros de dataset público ${report.diagnostics?.datasetOutputsWithoutRunId ?? 'indisponível'} (com fonte, URL e chave do registro ${report.diagnostics?.datasetOutputsWithSourcePointer ?? 'indisponível'}); capturas ${report.diagnostics?.captureOutputsWithoutRunId ?? 'indisponível'}. Datasets não representam captura cron A7.`,
  `Última execução: ${report.diagnostics?.lastConnectorStartedAt ?? 'indisponível'}; última captura: ${report.diagnostics?.lastOutputCapturedAt ?? 'indisponível'}.`,
  '',
  'Não declarar 100% sem sign-off institucional, aprovação humana e sete dias completos de monitoramento real.',
  '',
].join('\n');

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = await collectV5Acceptance(process.env.MOTOR_NEON_DATABASE_URL || process.env.DATABASE_URL);
    console.log(JSON.stringify(report, null, 2));
    if (process.env.V5_REPORT_PATH) writeFileSync(process.env.V5_REPORT_PATH, JSON.stringify(report, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY) {
      const { appendFileSync } = await import('node:fs');
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, formatV5AcceptanceSummary(report));
    }
    if (report.status === 'blocked') console.warn('::warning::Motor V5 acceptance is blocked by observed evidence; no synthetic data was created.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
