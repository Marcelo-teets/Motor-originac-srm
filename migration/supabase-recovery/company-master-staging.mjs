import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { canonicalCnpjKey } from './cnpj-normalization.mjs';
import { assertAuditConnections } from './data-plane-cutover-inventory.mjs';

// Offline recovery helper: company identity only, no scores, decisions or Auth.
const normalize = x => String(x ?? '').trim().toLowerCase();
const domain = x => normalize(x).replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].replace(/\.$/, '');
const validDomain = x => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(x);
const validId = x => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalize(x));
const keyCounts = (rows, get) => {
  const keys = new Map();
  for (const row of rows) {
    const key = get(row);
    if (key) keys.set(key, (keys.get(key) ?? 0) + 1);
  }
  return keys;
};
const rowDomain = x => domain(x.normalized_domain || x.domain || x.website_url || x.website);
const clean = x => typeof x === 'string' ? (x.trim() || null) : null;

export function planCompanyMasterStage(source, target) {
  assert.ok(Array.isArray(source) && Array.isArray(target), 'Missing company arrays');
  const sourceIds = keyCounts(source, x => normalize(x.id));
  const sourceCnpjs = keyCounts(source, x => canonicalCnpjKey(x.cnpj));
  const sourceDomains = keyCounts(source, rowDomain);
  const targetIds = new Map(target.map(x => [normalize(x.id), x]));
  const targetCnpjs = keyCounts(target, x => canonicalCnpjKey(x.cnpj));
  const targetDomains = keyCounts(target, rowDomain);
  const status = {invalidIdentity: 0, duplicatedSourceIdentity: 0,
    collidingTargetIdentity: 0, alreadyStaged: 0, eligible: 0};
  const records = [];
  for (const x of source) {
    const id = normalize(x.id), cnpj = canonicalCnpjKey(x.cnpj), host = rowDomain(x);
    if (!validId(id) || !cnpj || !validDomain(host) || !clean(x.legal_name)) {
      status.invalidIdentity++;
      continue;
    }
    if ((sourceIds.get(id) ?? 0) !== 1 ||
        (sourceCnpjs.get(cnpj) ?? 0) !== 1 ||
        (sourceDomains.get(host) ?? 0) !== 1) {
      status.duplicatedSourceIdentity++;
      continue;
    }
    const existing = targetIds.get(id);
    if (existing && canonicalCnpjKey(existing.cnpj) === cnpj &&
        rowDomain(existing) === host &&
        existing.metadata?.recoverySource === 'supabase' &&
        existing.metadata?.creditReviewRequired === true) {
      status.alreadyStaged++;
      continue;
    }
    if (existing || targetCnpjs.has(cnpj) || targetDomains.has(host)) {
      status.collidingTargetIdentity++;
      continue;
    }
    // Never interpret historical flags or evidence as human approval.
    records.push({
      id, cnpj, domain: host, normalized_domain: host,
      legal_name: clean(x.legal_name), trade_name: clean(x.trade_name),
      website: clean(x.website || x.website_url),
      website_url: clean(x.website_url || x.website),
      description: clean(x.description),
      segment: clean(x.segment || x.sector),
      subsegment: clean(x.subsegment || x.sub_sector),
      geography: clean(x.geography),
      country: clean(x.country) || 'BR',
      origin: 'legacy_supabase_identity_review',
      metadata: {recoverySource: 'supabase', recoveryStatus: 'unverified_identity',
        creditReviewRequired: true, noHistoricalCreditApproval: true},
    });
    status.eligible++;
  }
  assert.equal(Object.values(status).reduce((n, x) => n + x, 0), source.length,
    'Every source identity must be classified exactly once');
  return {report: {schema: 'motor.company-master-staging.v1',
      sourceCount: source.length, targetCount: target.length, ...status,
      migrationApproved: false, creditApprovalImported: false,
      productionWriteAllowed: false, requiresHumanIdentityReview: true},
    records}; // Private in-memory payload: never print rows or put them in CI artifacts.
}

const fingerprints = rows => rows.map(x => [normalize(x.id), canonicalCnpjKey(x.cnpj), rowDomain(x)].join(':')).sort();
export function assertStagingBaselineMatchesProduction(production, staging) {
  assert.deepEqual(fingerprints(staging), fingerprints(production),
    'Staging baseline differs from production; refusing application');
}
export function assertStagingNotProduction(productionUrl, stagingUrl) {
  assert.ok(productionUrl && stagingUrl, 'Missing database URLs');
  const a = new URL(productionUrl), b = new URL(stagingUrl);
  const endpoint = u => u.hostname.split('.')[0].replace(/-pooler$/, '');
  assert.ok(['postgres:', 'postgresql:'].includes(a.protocol) &&
    ['postgres:', 'postgresql:'].includes(b.protocol), 'PostgreSQL only');
  assert.ok(a.hostname.endsWith('.neon.tech') && b.hostname.endsWith('.neon.tech'),
    'Both connections must be Neon');
  assert.ok(endpoint(a).startsWith('ep-') && endpoint(b).startsWith('ep-'),
    'Dedicated Neon branch endpoints required');
  assert.notEqual(endpoint(a), endpoint(b), 'Refusing production branch or pooler alias');
}

const SOURCE_SQL = 'select id::text, legal_name, trade_name, cnpj, domain, website, website_url, ' +
  'description, segment, subsegment, sector, sub_sector, country, geography from public.companies';
const TARGET_SQL = 'select id::text, cnpj, normalized_domain, domain, website, website_url, metadata from public.companies';
const STAGING_SQL = [
  'insert into public.companies',
  '(id, legal_name, trade_name, cnpj, domain, normalized_domain, website, website_url,',
  'description, segment, subsegment, country, geography, origin, metadata)',
  'select p.id, p.legal_name, p.trade_name, p.cnpj, p.domain, p.normalized_domain,',
  'p.website, p.website_url, p.description, p.segment, p.subsegment, p.country,',
  'p.geography, p.origin, p.metadata',
  'from jsonb_populate_recordset(null::public.companies, $1::jsonb) p',
  'where not exists (select 1 from public.companies c where c.id=p.id',
  "or regexp_replace(upper(coalesce(c.cnpj,'')), '[^0-9A-Z]', '', 'g')=p.cnpj",
  "or lower(coalesce(c.normalized_domain,c.domain,''))=p.normalized_domain)",
  'on conflict do nothing returning id',
].join('\n');

// Full-row, ordered digests protect against staging branches that merely have
// the same company IDs but differ in signals, sources, monitoring, or approvals.
// Fixed allowlist: no user-controlled schema/table names in SQL.
export const STAGING_BASELINE_TABLES = Object.freeze([
  'companies', 'source_catalog', 'search_profiles', 'monitoring_outputs',
  'company_signals', 'qualification_snapshots', 'company_credit_reviews',
  'discovered_company_candidates', 'pipeline',
]);

export function assertStagingTableParity(production, staging) {
  assert.ok(production && staging && typeof production === 'object' &&
    typeof staging === 'object', 'Both table baselines are required');
  for (const table of STAGING_BASELINE_TABLES) {
    const a = production[table], b = staging[table];
    assert.ok(a && b && /^(?:0|[1-9][0-9]*)$/.test(String(a.count)) &&
      /^(?:0|[1-9][0-9]*)$/.test(String(b.count)) &&
      /^[0-9a-f]{32}$/.test(String(a.digest)) && /^[0-9a-f]{32}$/.test(String(b.digest)),
    'Missing or invalid baseline for ' + table);
    assert.equal(String(b.count), String(a.count), 'Staging row count diverges: ' + table);
    assert.equal(b.digest, a.digest, 'Staging row contents diverge: ' + table);
  }
}

async function inspectTableBaseline(db) {
  const stats = {};
  for (const table of STAGING_BASELINE_TABLES) {
    const query = 'select count(*)::bigint as count, ' +
      "md5(coalesce(string_agg(md5(to_jsonb(t)::text), '|' order by t.id::text), '')) as digest " +
      'from public.' + table + ' t';
    const {rows} = await db.query(query);
    assert.ok(rows.length === 1, 'Invalid baseline query result: ' + table);
    stats[table] = {count: String(rows[0].count), digest: rows[0].digest};
  }
  return stats;
}

async function inspectReadOnly(url, sql, applicationName, includeBaseline = false) {
  const {default: pg} = await import('pg');
  const db = new pg.Client({connectionString: url, connectionTimeoutMillis: 10000,
    statement_timeout: 20000, application_name: applicationName});
  await db.connect();
  try {
    await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const rows = (await db.query(sql)).rows;
    const baseline = includeBaseline ? await inspectTableBaseline(db) : null;
    await db.query('COMMIT');
    return {rows, baseline};
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await db.end();
  }
}

export async function runCompanyMasterStage({supabaseUrl, productionUrl, stagingUrl, applyStaging = false}) {
  assertAuditConnections(supabaseUrl, productionUrl);
  const [sourceState, productionState] = await Promise.all([
    inspectReadOnly(supabaseUrl, SOURCE_SQL, 'motor-company-recovery-source-readonly'),
    inspectReadOnly(productionUrl, TARGET_SQL, 'motor-company-recovery-production-readonly', true),
  ]);
  const production = productionState.rows;
  const plan = planCompanyMasterStage(sourceState.rows, production);
  if (!applyStaging) return {...plan.report, stagingApplied: false};
  assertStagingNotProduction(productionUrl, stagingUrl);
  assert.equal(process.env.MOTOR_RECOVERY_ALLOW_STAGING, 'REVIEWED_STAGING_ONLY',
    'Explicit staging-only authorization required');
  assert.equal(plan.report.duplicatedSourceIdentity + plan.report.collidingTargetIdentity, 0,
    'Conflicting identities present; refusing staging until reconciled');
  const {default: pg} = await import('pg');
  const db = new pg.Client({connectionString: stagingUrl, connectionTimeoutMillis: 10000,
    statement_timeout: 30000, application_name: 'motor-company-recovery-staging-only'});
  await db.connect();
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const baseline = (await db.query(TARGET_SQL)).rows;
    assertStagingBaselineMatchesProduction(production, baseline);
    assertStagingTableParity(productionState.baseline, await inspectTableBaseline(db));
    const inserted = plan.records.length ?
      await db.query(STAGING_SQL, [JSON.stringify(plan.records)]) : {rowCount: 0};
    assert.equal(inserted.rowCount, plan.records.length,
      'Staging row count mismatch; rolling back');
    await db.query('COMMIT');
    return {...plan.report, stagingApplied: true, stagedRows: inserted.rowCount};
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await db.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runCompanyMasterStage({
      supabaseUrl: process.env.MOTOR_SUPABASE_AUDIT_DATABASE_URL,
      productionUrl: process.env.MOTOR_NEON_DATABASE_URL,
      stagingUrl: process.env.MOTOR_NEON_STAGING_DATABASE_URL,
      applyStaging: process.argv.includes('--apply-staging'),
    });
    console.log(JSON.stringify(result, null, 2)); // Aggregate-only: no company identifiers.
    process.exitCode = result.invalidIdentity || result.duplicatedSourceIdentity ||
      result.collidingTargetIdentity ? 2 : 0;
  } catch {
    console.error('Company staging failed closed. Verify authorized database settings.');
    process.exitCode = 1;
  }
}
