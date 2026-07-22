import { createPlatformRepository } from '../repositories/platformRepository.js';
import { getSupabaseClient } from '../lib/supabase.js';
import { PlatformService } from './platformService.js';

type PublicRecordCompanyRow = {
  company_id: string | null;
  dataset_code: string;
};

export type PublicDataDownstreamSummary = {
  status: 'real' | 'partial';
  datasets: string[];
  affectedCompanies: number;
  recomputedCompanies: number;
  qualificationsWritten: number;
  patternsWritten: number;
  scoreSnapshotsWritten: number;
  leadScoreSnapshotsWritten: number;
  rankingRefreshed: boolean;
  errors: string[];
};

export const uniqueAffectedCompanyIds = (rows: PublicRecordCompanyRow[]) => Array.from(new Set(
  rows
    .map((row) => row.company_id)
    .filter((companyId): companyId is string => typeof companyId === 'string' && companyId.length > 0),
));

export class PublicDataDownstreamService {
  private readonly client = getSupabaseClient();

  async sync(datasets: string[]): Promise<PublicDataDownstreamSummary> {
    const uniqueDatasets = [...new Set(datasets)];
    const summary: PublicDataDownstreamSummary = {
      status: 'real',
      datasets: uniqueDatasets,
      affectedCompanies: 0,
      recomputedCompanies: 0,
      qualificationsWritten: 0,
      patternsWritten: 0,
      scoreSnapshotsWritten: 0,
      leadScoreSnapshotsWritten: 0,
      rankingRefreshed: false,
      errors: [],
    };

    if (!this.client) {
      return {
        ...summary,
        status: 'partial',
        errors: ['Supabase client not configured for public-data downstream sync.'],
      };
    }

    const rows = await this.client.select('public_company_records', {
      select: 'company_id,dataset_code',
      limit: 50_000,
      filters: [{ column: 'dataset_code', operator: 'in', value: uniqueDatasets }],
    }) as PublicRecordCompanyRow[];

    const companyIds = uniqueAffectedCompanyIds(rows);
    summary.affectedCompanies = companyIds.length;
    if (!companyIds.length) return summary;

    const repository = createPlatformRepository('supabase');
    const platform = new PlatformService(repository);

    for (const companyId of companyIds) {
      try {
        const result = await platform.recomputeDerivedData(companyId);
        summary.recomputedCompanies += 1;
        summary.qualificationsWritten += result.qualifications.length;
        summary.patternsWritten += result.patterns.length;
        summary.scoreSnapshotsWritten += result.scoreSnapshots.length;
        summary.leadScoreSnapshotsWritten += result.leadScoreSnapshots.length;
      } catch (error) {
        summary.errors.push(`${companyId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    try {
      await this.client.rpc('refresh_ranking_v2', {});
      summary.rankingRefreshed = true;
    } catch (error) {
      summary.errors.push(`refresh_ranking_v2: ${error instanceof Error ? error.message : String(error)}`);
    }

    summary.status = summary.errors.length ? 'partial' : 'real';
    return summary;
  }
}
