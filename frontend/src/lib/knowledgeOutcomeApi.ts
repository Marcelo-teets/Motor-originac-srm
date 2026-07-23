import type { SessionData } from './types';
import type {
  FactorPipelineOutcome,
  KnowledgeOutcomeDimension,
  KnowledgeOutcomeIntelligence,
  KnowledgeOutcomeSummary,
  KnowledgeRecentExecutionOutcome,
  OutcomeSampleQuality,
} from './knowledgeOutcomeTypes';

const env = import.meta.env;
const supabaseUrl = String(env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const supabaseAnonKey = String(env.VITE_SUPABASE_ANON_KEY ?? '');

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const numberOrZero = (value: unknown): number => numberOrNull(value) ?? 0;

const mapDimension = (row: Record<string, unknown>): KnowledgeOutcomeDimension => ({
  dimensionType: String(row.dimension_type ?? ''),
  dimensionValue: String(row.dimension_value ?? ''),
  executions: numberOrZero(row.executions),
  companiesObserved: numberOrZero(row.companies_observed),
  completedOutcomes: numberOrZero(row.completed_outcomes),
  won: numberOrZero(row.won),
  lost: numberOrZero(row.lost),
  progress: numberOrZero(row.progress),
  blocked: numberOrZero(row.blocked),
  noChange: numberOrZero(row.no_change),
  open: numberOrZero(row.open),
  terminalDecisions: numberOrZero(row.terminal_decisions),
  observedWinRate: numberOrNull(row.observed_win_rate),
  observedStageAdvanceRate: numberOrNull(row.observed_stage_advance_rate),
  averageCycleDays: numberOrNull(row.average_cycle_days),
  capturedContextCount: numberOrZero(row.captured_context_count),
  reconstructedContextCount: numberOrZero(row.reconstructed_context_count),
  sampleQuality: String(row.sample_quality ?? 'insufficient') as OutcomeSampleQuality,
  latestObservationAt: row.latest_observation_at ? String(row.latest_observation_at) : null,
});

const mapFactor = (row: Record<string, unknown>): FactorPipelineOutcome => ({
  factorCode: String(row.factor_code ?? ''),
  factorName: String(row.factor_name ?? ''),
  dimension: String(row.dimension ?? ''),
  companiesObserved: numberOrZero(row.companies_observed),
  positiveOutcomes: numberOrZero(row.positive_outcomes),
  negativeOutcomes: numberOrZero(row.negative_outcomes),
  activePipeline: numberOrZero(row.active_pipeline),
  unworked: numberOrZero(row.unworked),
  averageFactorScore: numberOrNull(row.average_factor_score),
  averageNetContribution: numberOrNull(row.average_net_contribution),
  averageConfidence: numberOrNull(row.average_confidence),
  observedPositiveRate: numberOrNull(row.observed_positive_rate),
  sampleQuality: String(row.sample_quality ?? 'insufficient') as OutcomeSampleQuality,
  latestEvidenceAt: row.latest_evidence_at ? String(row.latest_evidence_at) : null,
});

const mapSummary = (row: Record<string, unknown>): KnowledgeOutcomeSummary => ({
  executions: numberOrZero(row.executions),
  companiesObserved: numberOrZero(row.companiesObserved),
  completedOutcomes: numberOrZero(row.completedOutcomes),
  openExecutions: numberOrZero(row.openExecutions),
  won: numberOrZero(row.won),
  lost: numberOrZero(row.lost),
  progress: numberOrZero(row.progress),
  blocked: numberOrZero(row.blocked),
  noChange: numberOrZero(row.noChange),
  terminalDecisions: numberOrZero(row.terminalDecisions),
  observedWinRate: numberOrNull(row.observedWinRate),
  observedStageAdvanceRate: numberOrNull(row.observedStageAdvanceRate),
  averageCycleDays: numberOrNull(row.averageCycleDays),
  capturedContextCount: numberOrZero(row.capturedContextCount),
  reconstructedContextCount: numberOrZero(row.reconstructedContextCount),
});

const mapRecent = (row: Record<string, unknown>): KnowledgeRecentExecutionOutcome => ({
  activityId: String(row.activityId ?? ''),
  companyId: String(row.companyId ?? ''),
  companyName: String(row.companyName ?? ''),
  nodeId: String(row.nodeId ?? ''),
  nodeTitle: String(row.nodeTitle ?? ''),
  activityType: String(row.activityType ?? ''),
  title: String(row.title ?? ''),
  outcomeStatus: row.outcomeStatus ? String(row.outcomeStatus) : null,
  outcome: row.outcome ? String(row.outcome) : null,
  suggestedStructure: row.suggestedStructure ? String(row.suggestedStructure) : null,
  occurredAt: String(row.occurredAt ?? ''),
  completedAt: row.completedAt ? String(row.completedAt) : null,
  cycleDays: numberOrNull(row.cycleDays),
  contextMode: String(row.contextMode ?? 'reconstructed_current'),
});

const mapRows = (value: unknown): Record<string, unknown>[] => Array.isArray(value)
  ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
  : [];

export const knowledgeOutcomeApi = {
  get: async (
    session: SessionData | null,
    companyId?: string,
    days = 365,
  ): Promise<KnowledgeOutcomeIntelligence> => {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Outcome Intelligence requer VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
    }
    if (!session?.access_token) throw new Error('Sessão autenticada necessária para Outcome Intelligence.');

    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/knowledge_outcome_intelligence`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_company_id: companyId || null,
        p_days: days,
      }),
    });

    const raw = await response.text();
    const payload = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    if (!response.ok) {
      throw new Error(String(payload.message ?? payload.details ?? `Outcome Intelligence falhou com status ${response.status}.`));
    }

    const dimensions = (payload.dimensions ?? {}) as Record<string, unknown>;
    return {
      generatedAt: String(payload.generatedAt ?? ''),
      scope: payload.scope === 'company' ? 'company' : 'global',
      companyId: payload.companyId ? String(payload.companyId) : null,
      windowDays: numberOrZero(payload.windowDays),
      summary: mapSummary((payload.summary ?? {}) as Record<string, unknown>),
      dimensions: {
        actionTypes: mapRows(dimensions.actionTypes).map(mapDimension),
        nodeTypes: mapRows(dimensions.nodeTypes).map(mapDimension),
        structures: mapRows(dimensions.structures).map(mapDimension),
        signalTypes: mapRows(dimensions.signalTypes).map(mapDimension),
        patterns: mapRows(dimensions.patterns).map(mapDimension),
        factors: mapRows(dimensions.factors).map(mapDimension),
      },
      factorPipelineMap: mapRows(payload.factorPipelineMap).map(mapFactor),
      recentExecutions: mapRows(payload.recentExecutions).map(mapRecent),
      caveat: String(payload.caveat ?? 'Associações observacionais; não interpretar como causalidade.'),
    };
  },
};
