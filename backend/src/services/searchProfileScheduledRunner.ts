import type { SearchProfile } from '../types/platform.js';
import type { SearchProfileCaptureSummary, SearchProfileRunRecord } from './searchProfileCaptureService.js';

export type ScheduledRunnerDeps = {
  listSearchProfiles(): Promise<SearchProfile[]>;
  listRuns(searchProfileId: string): Promise<SearchProfileRunRecord[]>;
  runCapture(searchProfileId: string, triggerMode: 'manual' | 'scheduled' | 'bootstrap'): Promise<SearchProfileCaptureSummary>;
};

export type ScheduledRunnerOptions = {
  // Idempotência de cadência: não repetir um profile que completou há menos
  // de minIntervalHours (cadência diária com folga para variação do cron).
  minIntervalHours?: number;
  // Lease: uma execução queued/running mais nova que staleRunningMinutes
  // bloqueia nova execução; mais velha que isso é considerada morta.
  staleRunningMinutes?: number;
  now?: () => Date;
};

export type ScheduledProfileResult = {
  searchProfileId: string;
  profileName: string;
  action: 'executed' | 'skipped_recent_run' | 'skipped_run_in_progress' | 'failed';
  runStatus?: SearchProfileRunRecord['runStatus'];
  candidatesFound?: number;
  candidatesInserted?: number;
  dedupedAgainstExisting?: number;
  note?: string;
};

export type ScheduledRunnerSummary = {
  triggeredAt: string;
  activeProfiles: number;
  executed: number;
  skipped: number;
  failed: number;
  results: ScheduledProfileResult[];
};

const latestRun = (runs: SearchProfileRunRecord[]) =>
  [...runs].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];

const hoursSince = (iso: string | undefined, now: Date) => {
  if (!iso) return Number.POSITIVE_INFINITY;
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - at) / (1000 * 60 * 60);
};

export async function runScheduledSearchProfiles(
  deps: ScheduledRunnerDeps,
  options: ScheduledRunnerOptions = {},
): Promise<ScheduledRunnerSummary> {
  const minIntervalHours = options.minIntervalHours ?? 20;
  const staleRunningMinutes = options.staleRunningMinutes ?? 30;
  const now = (options.now ?? (() => new Date()))();

  const profiles = (await deps.listSearchProfiles()).filter((profile) => profile.status === 'active');
  const results: ScheduledProfileResult[] = [];

  // Sequencial de propósito: evita tempestade de fetches paralelos por perfil
  // e mantém os guards de lease consistentes dentro da mesma execução.
  for (const profile of profiles) {
    const runs = await deps.listRuns(profile.id);
    const last = latestRun(runs);

    if (last && (last.runStatus === 'running' || last.runStatus === 'queued')) {
      const ageMinutes = hoursSince(last.startedAt ?? last.createdAt, now) * 60;
      if (ageMinutes < staleRunningMinutes) {
        results.push({
          searchProfileId: profile.id,
          profileName: profile.name,
          action: 'skipped_run_in_progress',
          runStatus: last.runStatus,
          note: `Run ${last.id} em andamento há ${Math.round(ageMinutes)}min (lease de ${staleRunningMinutes}min).`,
        });
        continue;
      }
    }

    if (last && last.runStatus === 'completed' && hoursSince(last.finishedAt ?? last.createdAt, now) < minIntervalHours) {
      results.push({
        searchProfileId: profile.id,
        profileName: profile.name,
        action: 'skipped_recent_run',
        runStatus: last.runStatus,
        note: `Última execução completou há menos de ${minIntervalHours}h.`,
      });
      continue;
    }

    try {
      const summary = await deps.runCapture(profile.id, 'scheduled');
      results.push({
        searchProfileId: profile.id,
        profileName: profile.name,
        action: summary.run.runStatus === 'failed' ? 'failed' : 'executed',
        runStatus: summary.run.runStatus,
        candidatesFound: summary.run.candidatesFound,
        candidatesInserted: summary.run.candidatesInserted,
        dedupedAgainstExisting: summary.dedupedAgainstExisting,
        note: summary.run.notes,
      });
    } catch (error) {
      results.push({
        searchProfileId: profile.id,
        profileName: profile.name,
        action: 'failed',
        note: error instanceof Error ? error.message : 'Unknown scheduled capture failure',
      });
    }
  }

  return {
    triggeredAt: now.toISOString(),
    activeProfiles: profiles.length,
    executed: results.filter((item) => item.action === 'executed').length,
    skipped: results.filter((item) => item.action.startsWith('skipped')).length,
    failed: results.filter((item) => item.action === 'failed').length,
    results,
  };
}
