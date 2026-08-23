import { pathToFileURL } from 'node:url';
import { createPlatformRepository } from '../backend/src/repositories/platformRepository.js';
import { isCompanyDecisionEligible } from '../backend/src/lib/companyDecisionEligibility.js';
import { getSupabaseClient } from '../backend/src/lib/supabase.js';
import { PlatformService } from '../backend/src/services/platformService.js';

const latestCompanyIds = <T extends { companyId: string }>(rows: T[]) => new Set(rows.map((row) => row.companyId));

export type DerivedIntelligenceValidation = {
  decisionCompanies: number;
  qualificationCoverage: number;
  patternCompanyCoverage: number;
  scoreCoverage: number;
  leadScoreCoverage: number;
  rankingCoverage: number;
};

export const runDerivedIntelligenceRecompute = async (): Promise<DerivedIntelligenceValidation> => {
  if (process.env.USE_SUPABASE !== 'true') throw new Error('USE_SUPABASE=true is required for derived intelligence recompute.');
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }

  const repository = createPlatformRepository('supabase');
  const service = new PlatformService(repository);
  const companies = await repository.listCompanies();
  const decisionCompanies = companies.filter(isCompanyDecisionEligible);
  const decisionIds = new Set(decisionCompanies.map((company) => company.id));
  if (!decisionCompanies.length) throw new Error('derived_intelligence_no_decision_eligible_companies');

  const snapshots = await service.recomputeDerivedData();
  if (snapshots.qualifications.length !== decisionCompanies.length) {
    throw new Error(`derived_intelligence_recompute_count_mismatch:${snapshots.qualifications.length}/${decisionCompanies.length}`);
  }

  const client = getSupabaseClient();
  if (!client) throw new Error('derived_intelligence_supabase_client_unavailable');
  await client.rpc('refresh_ranking_v2', {});

  const [qualifications, patterns, scores, leadScores, rankingRows] = await Promise.all([
    repository.listQualificationSnapshots(),
    repository.listCompanyPatterns(),
    repository.listScoreSnapshots(),
    repository.listLeadScoreSnapshots(),
    client.select('ranking_v2', { select: '*', orderBy: { column: 'created_at', ascending: false }, limit: 5000 }),
  ]);

  const qualificationCoverage = [...latestCompanyIds(qualifications)].filter((id) => decisionIds.has(id)).length;
  const patternCompanyCoverage = [...latestCompanyIds(patterns)].filter((id) => decisionIds.has(id)).length;
  const scoreCoverage = [...latestCompanyIds(scores)].filter((id) => decisionIds.has(id)).length;
  const leadScoreCoverage = [...latestCompanyIds(leadScores)].filter((id) => decisionIds.has(id)).length;

  const latestRankingAt = rankingRows?.[0]?.created_at;
  const rankingCoverage = new Set(
    (rankingRows ?? [])
      .filter((row: any) => row.created_at === latestRankingAt && decisionIds.has(row.company_id))
      .map((row: any) => row.company_id),
  ).size;

  const validation: DerivedIntelligenceValidation = {
    decisionCompanies: decisionCompanies.length,
    qualificationCoverage,
    patternCompanyCoverage,
    scoreCoverage,
    leadScoreCoverage,
    rankingCoverage,
  };

  console.log(JSON.stringify({ event: 'derived_intelligence_validation', ...validation }, null, 2));

  const incomplete = [
    ['qualification', qualificationCoverage],
    ['score', scoreCoverage],
    ['lead_score', leadScoreCoverage],
    ['ranking', rankingCoverage],
  ].filter(([, coverage]) => Number(coverage) !== decisionCompanies.length);
  if (incomplete.length) {
    throw new Error(`derived_intelligence_incomplete:${incomplete.map(([name, coverage]) => `${name}=${coverage}/${decisionCompanies.length}`).join(',')}`);
  }

  // Patterns are evidence-dependent: a company may legitimately have zero active patterns.
  return validation;
};

const isDirectExecution = Boolean(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href);
if (isDirectExecution) {
  runDerivedIntelligenceRecompute().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
