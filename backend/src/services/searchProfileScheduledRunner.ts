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
  // Orçamento da invocação serverless (função Vercel tem 30s): quando o tempo
  // decorrido excede o orçamento, os profiles restantes são adiados para a
  // próxima execução em vez de estourar FUNCTION_INVOCATION_TIMEOUT.
  timeBudgetMs?: number;
  now?: () => Date;
};

export type ScheduledProfileResult = {
  searchProfileId: string;
  profileName: string;
  action: 'executed' | 'skipped_recent_run' | 'skipped_run_in_progress' | 'deferred_time_budget' | 'failed';
  runStatus?: SearchProfileRunRecord['runStatus'];
  candidatesFound?: number;
  candidatesInserted?: number;
  dedupedAgainstExisting?: number;
  note?: string;
};

export type ScheduledRunnerSummary = {
  triggeredAt: string;
  // Diagnóstico de funil (P1): totalProfiles distingue "não há perfis" de
  // "perfis existem mas nenhum está ativo" — sem isso, activeProfiles=0 é opaco.
  totalProfiles: number;
  activeProfiles: number;
  inactiveProfiles: number;
  executed: number;
  skipped: number;
  failed: number;
  note?: string;
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
  const timeBudgetMs = options.timeBudgetMs ?? 20000;
  const clock = options.now ?? (() => new Date());
  const now = clock();
  const startedAtMs = now.getTime();

  const allProfiles = await deps.listSearchProfiles();
  const profiles = allProfiles.filter((profile) => profile.status === 'active');
  const results: ScheduledProfileResult[] = [];

  // Sequencial de propósito: evita tempestade de fetches paralelos por perfil
  // e mantém os guards de lease consistentes dentro da mesma execução.
  for (const profile of profiles) {
    if (clock().getTime() - startedAtMs > timeBudgetMs) {
      results.push({
        searchProfileId: profile.id,
        profileName: profile.name,
        action: 'deferred_time_budget',
        note: `Orçamento de ${timeBudgetMs}ms excedido; profile adiado para a próxima execução.`,
      });
      continue;
    }

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

  const inactiveProfiles = allProfiles.length - profiles.length;
  const note = allProfiles.length === 0
    ? 'Nenhum search profile cadastrado.'
    : profiles.length === 0
      ? `${allProfiles.length} profile(s) cadastrado(s), mas nenhum com status 'active' — ative um profile para popular o Capture Inbox.`
      : undefined;

  return {
    triggeredAt: now.toISOString(),
    totalProfiles: allProfiles.length,
    activeProfiles: profiles.length,
    inactiveProfiles,
    executed: results.filter((item) => item.action === 'executed').length,
    skipped: results.filter((item) => item.action.startsWith('skipped') || item.action === 'deferred_time_budget').length,
    failed: results.filter((item) => item.action === 'failed').length,
    ...(note ? { note } : {}),
    results,
  };
}
