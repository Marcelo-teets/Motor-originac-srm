import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const serverSource = readFileSync(new URL('../backend/src/server.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../db/migrations/116_harden_pipeline_eligibility_surfaces.sql', import.meta.url), 'utf8');

const pipelineRouteStart = serverSource.indexOf("app.get('/pipeline'");
const activityRouteStart = serverSource.indexOf("app.get('/activities'", pipelineRouteStart);
assert.ok(pipelineRouteStart >= 0 && activityRouteStart > pipelineRouteStart, 'pipeline route block must exist');
const pipelineRoutes = serverSource.slice(pipelineRouteStart, activityRouteStart);

assert.doesNotMatch(
  pipelineRoutes,
  /\?\?\s*await repository\.savePipelineRow/,
  'pipeline routes must not bypass service eligibility with a direct repository fallback',
);
assert.match(
  pipelineRoutes,
  /service\.getCompanyDetail\(companyId\)/,
  'pipeline creation fallback must confirm the company remains decision-eligible',
);
assert.match(
  pipelineRoutes,
  /res\.status\(403\)/,
  'ineligible pipeline writes must return a client-facing forbidden response',
);

assert.match(
  migration,
  /before insert or update on public\.pipeline/i,
  'database eligibility trigger must run on every pipeline mutation',
);
assert.doesNotMatch(
  migration,
  /before insert or update of company_id on public\.pipeline/i,
  'database guard must not be limited to company_id changes',
);
assert.match(
  migration,
  /public\.is_company_decision_eligible\(company_id\)/,
  'authenticated pipeline reads must filter by Company Master eligibility',
);
assert.match(
  migration,
  /where public\.is_company_decision_eligible\(c\.id\)/,
  'pipeline_kanban must hide mock, partial, synthetic, and excluded companies',
);
assert.match(
  migration,
  /candidate_unlinked_from_ineligible_company/,
  'stale candidate-link violations must be resolved with an audit reason',
);

console.log('Pipeline eligibility contract is protected across API, RLS, trigger, and view.');
