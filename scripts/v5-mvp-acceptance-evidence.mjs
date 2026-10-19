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
  const normalizedDays = monitoringDays.map((row) => {
    const sourceRuns = Number(row.successful_connector_runs);
    const connectorOutputs = Number(row.connector_outputs);
    const monitoringOutputs = Number(row.monitoring_outputs);
    assert.ok([sourceRuns, connectorOutputs, monitoringOutputs].every(v => Number.isSafeInteger(v) && v >= 0),
      'Invalid monitoring day counters');
    return {
      date: String(row.local_day).slice(0, 10),
      successfulConnectorRuns: sourceRuns,
      connectorOutputs,
      monitoringOutputs,
      healthy: sourceRuns > 0 && connectorOutputs > 0 && monitoringOutputs > 0,
    };
  });
  const dates = normalizedDays.map((d) => d.date);
  assert.equal(new Set(dates).size, dates.length, 'Duplicate monitoring dates');
  const consecutiveDates = normalizedDays.length === 7 && (() => {
    const sortedDates = [...dates].sort();
    return sortedDates.every((day, index) => {
      if (index === 0) return true;
      const previousDate = new Date(`${sortedDates[index - 1]}T00:00:00Z`);
      const currentDate = new Date(`${day}T00:00:00Z`);
      return Number.isFinite(currentDate.getTime())
        && currentDate.getTime() - previousDate.getTime() === 86400000;
    });
  })();
  const continuous = consecutiveDates && normalizedDays.every(d => d.healthy);
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
    warnings: ['Counts do not establish opportunity quality; human credit review and final institutional signoff remain mandatory.'],
  };
};

const METRICS_SQL = `
select
 (select count(*) from public.user_profiles where status = 'active' and role = 'god_mode') as active_admins,
 (select count(*) from public.fidc_assignor_human_reviews_v5) as fidc_human_reviews,
 (select count(*) from public.discovered_company_candidates) as candidates,
 (select count(*) from public.discovered_company_candidates where metadata->>'researchCohort'='fidc_dcm_first_party_credit_v5') as first_party_research_candidates,
 (select count(*) from public.companies c
   where exists (select 1 from public.company_credit_reviews r where r.company_id=c.id and r.status='approved')
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
), connector as (
 select (started_at at time zone 'America/Sao_Paulo')::date as local_day,
 count(*) filter (where status = 'completed') as successful_connector_runs,
 coalesce(sum(outputs_written) filter (where status = 'completed'),0) as connector_outputs
 from public.source_connector_runs
 group by 1
), outputs as (
 select (captured_at at time zone 'America/Sao_Paulo')::date as local_day,
 count(*) as monitoring_outputs from public.monitoring_outputs group by 1
)
select c.local_day::text as local_day,
 coalesce(connector.successful_connector_runs,0)::integer as successful_connector_runs,
 coalesce(connector.connector_outputs,0)::integer as connector_outputs,
 coalesce(outputs.monitoring_outputs,0)::integer as monitoring_outputs
from calendar c
left join connector on connector.local_day=c.local_day
left join outputs on outputs.local_day=c.local_day
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
