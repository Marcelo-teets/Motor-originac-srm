import type { SearchProfile } from '../types/platform.js';
import type { DiscoveredCandidateRecord, SearchProfileRunRecord } from './searchProfileCaptureService.js';

// Metas do P1 (Project Control V4.1 §7): funil de descoberta rumo a 50
// candidatos e 20 promoções, com 100% de lineage.
export const P1_CANDIDATE_TARGET = 50;
export const P1_PROMOTION_TARGET = 20;

export type DiscoveryHealth = {
  generatedAt: string;
  profiles: {
    total: number;
    active: number;
    inactive: number;
  };
  runs: {
    total: number;
    completed: number;
    partial: number;
    failed: number;
    lastRunAt: string | null;
    lastRunStatus: SearchProfileRunRecord['runStatus'] | null;
  };
  candidates: {
    total: number;
    captured: number;
    deduped: number;
    promoted: number;
    discarded: number;
    withLineage: number;
    lineagePct: number;
  };
  funnel: {
    candidateTarget: number;
    promotionTarget: number;
    candidateProgressPct: number;
    promotionProgressPct: number;
  };
  note?: string;
};

const pct = (value: number, total: number) => (total <= 0 ? 0 : Math.round((value / total) * 100));

const latestRunAt = (runs: SearchProfileRunRecord[]) => {
  const sorted = [...runs]
    .map((run) => run.finishedAt ?? run.createdAt ?? '')
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));
  return sorted[0] ?? null;
};

const latestRun = (runs: SearchProfileRunRecord[]) =>
  [...runs].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];

export function buildDiscoveryHealth(
  profiles: SearchProfile[],
  runs: SearchProfileRunRecord[],
  candidates: DiscoveredCandidateRecord[],
  now: () => Date = () => new Date(),
): DiscoveryHealth {
  const active = profiles.filter((profile) => profile.status === 'active').length;

  const byRunStatus = {
    completed: runs.filter((run) => run.runStatus === 'completed').length,
    // 'partial' não é um estado de run persistido hoje, mas mantemos o campo
    // para evolução sem quebrar o contrato do frontend.
    partial: runs.filter((run) => (run.runStatus as string) === 'partial').length,
    failed: runs.filter((run) => run.runStatus === 'failed').length,
  };

  const byCandidateStatus = {
    captured: candidates.filter((c) => c.candidateStatus === 'captured').length,
    deduped: candidates.filter((c) => c.candidateStatus === 'deduped').length,
    promoted: candidates.filter((c) => c.candidateStatus === 'promoted').length,
    discarded: candidates.filter((c) => c.candidateStatus === 'discarded').length,
  };

  // Lineage = candidato com fonte rastreável (sourceRef não vazio).
  const withLineage = candidates.filter((c) => Boolean(c.sourceRef && c.sourceRef !== 'unknown')).length;

  const note = profiles.length === 0
    ? 'Nenhum search profile cadastrado.'
    : active === 0
      ? `${profiles.length} profile(s) cadastrado(s), mas nenhum ativo — ative um profile para iniciar o funil.`
      : runs.length === 0
        ? 'Profiles ativos existem, mas nenhuma execução registrada ainda — dispare o runner de descoberta.'
        : undefined;

  const last = latestRun(runs);

  return {
    generatedAt: now().toISOString(),
    profiles: {
      total: profiles.length,
      active,
      inactive: profiles.length - active,
    },
    runs: {
      total: runs.length,
      completed: byRunStatus.completed,
      partial: byRunStatus.partial,
      failed: byRunStatus.failed,
      lastRunAt: latestRunAt(runs),
      lastRunStatus: last?.runStatus ?? null,
    },
    candidates: {
      total: candidates.length,
      captured: byCandidateStatus.captured,
      deduped: byCandidateStatus.deduped,
      promoted: byCandidateStatus.promoted,
      discarded: byCandidateStatus.discarded,
      withLineage,
      lineagePct: pct(withLineage, candidates.length),
    },
    funnel: {
      candidateTarget: P1_CANDIDATE_TARGET,
      promotionTarget: P1_PROMOTION_TARGET,
      candidateProgressPct: Math.min(100, pct(candidates.length, P1_CANDIDATE_TARGET)),
      promotionProgressPct: Math.min(100, pct(byCandidateStatus.promoted, P1_PROMOTION_TARGET)),
    },
    ...(note ? { note } : {}),
  };
}
