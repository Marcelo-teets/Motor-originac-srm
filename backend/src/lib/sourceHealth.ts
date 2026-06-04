import { getSupabaseClient } from './supabase.js';
import type { MonitoringOutput, SourceCatalogEntry } from '../types/platform.js';

type SourceConnectorRun = {
  id: string;
  sourceId?: string | null;
  status: string;
  triggerType?: string | null;
  scopeType?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  itemsCollected: number;
  outputsWritten: number;
  signalsWritten: number;
  enrichmentsWritten: number;
  errorMessage?: string | null;
  metadata: Record<string, unknown>;
};

type SourceHealthRow = SourceCatalogEntry & {
  outputCount: number;
  realOutputCount: number;
  partialOutputCount: number;
  averageConfidence: number;
  lastOutputAt: string | null;
  lastOutputTitle: string | null;
  lastOutputStatus: string | null;
  runCount: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunError: string | null;
  runOutputsWritten: number;
  runSignalsWritten: number;
  isOfficial: boolean;
  decision: string;
  nextAction: string;
};

export type SourceHealthSnapshot = {
  summary: {
    totalSources: number;
    healthySources: number;
    degradedSources: number;
    downSources: number;
    activeSources: number;
    totalOutputs: number;
    realOutputs: number;
    partialOutputs: number;
    officialSourcesObserved: number;
    connectorRuns: number;
    failedRuns: number;
  };
  sources: SourceHealthRow[];
};

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const sourceCode = (source: SourceCatalogEntry) => typeof source.metadata?.code === 'string' ? source.metadata.code : source.id;

const isOfficialSource = (source: SourceCatalogEntry) => /cvm|bcb|ifdata|pncp|receita|anbima|fidc|central_bank|procurement|government|regulatory|capital_markets/.test(
  normalize(`${source.id} ${source.name} ${source.sourceType} ${source.category} ${sourceCode(source)}`),
);

const sourceDecision = (source: SourceCatalogEntry, outputs: MonitoringOutput[], runs: SourceConnectorRun[], official: boolean) => {
  if (source.health === 'down') {
    return { decision: 'Fonte indisponível', nextAction: 'Revisar adapter, URL ou credencial antes de usar no score.' };
  }
  if (source.status === 'planned') {
    return { decision: 'Planejada', nextAction: 'Priorizar implementação somente se melhorar originação real.' };
  }
  const failedRuns = runs.filter((run) => run.status === 'failed').length;
  if (runs.length && failedRuns >= Math.ceil(runs.length / 2)) {
    return { decision: 'Falhas recorrentes', nextAction: 'Investigar logs de source_connector_runs e payloads de erro.' };
  }
  if (!outputs.length) {
    return { decision: 'Sem evidência recente', nextAction: official ? 'Rodar captura oficial e validar persistência no Supabase.' : 'Rodar captura e checar match por empresa.' };
  }
  const partialCount = outputs.filter((item) => item.connectorStatus !== 'real').length;
  if (partialCount > outputs.length / 2) {
    return { decision: 'Atenção', nextAction: 'Investigar conectores parciais e payloads de erro.' };
  }
  return { decision: 'Operacional', nextAction: 'Usar evidências em qualification, patterns e ranking.' };
};

const stringValues = (...values: unknown[]) => values
  .flatMap((value) => Array.isArray(value) ? value : [value])
  .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  .map((value) => value.trim());

const runSourceKeys = (run: SourceConnectorRun) => {
  const metadata = run.metadata ?? {};
  const requested = typeof metadata.requested === 'object' && metadata.requested ? metadata.requested as Record<string, unknown> : {};

  return new Set(stringValues(
    run.sourceId,
    requested.sourceId,
    metadata.sourceId,
    metadata.sourceCode,
    metadata.sourceCodes,
  ));
};

const outputSourceKeys = (output: MonitoringOutput) => new Set(stringValues(
  output.sourceId,
  output.normalizedPayload?.sourceCode,
  output.normalizedPayload?.code,
));

const sourceKeys = (source: SourceCatalogEntry) => new Set(stringValues(
  source.id,
  sourceCode(source),
  source.metadata?.code,
));

const intersects = (left: Set<string>, right: Set<string>) => {
  for (const value of left) {
    if (right.has(value)) return true;
  }
  return false;
};

export async function listSourceConnectorRuns(limit = 250): Promise<SourceConnectorRun[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  try {
    const rows = await client.select('source_connector_runs', {
      select: '*',
      orderBy: { column: 'started_at', ascending: false },
      limit,
    });

    return (rows ?? []).map((row: any) => ({
      id: row.id,
      sourceId: row.source_id,
      status: row.status ?? 'unknown',
      triggerType: row.trigger_type,
      scopeType: row.scope_type,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      itemsCollected: Number(row.items_collected ?? 0),
      outputsWritten: Number(row.outputs_written ?? 0),
      signalsWritten: Number(row.signals_written ?? 0),
      enrichmentsWritten: Number(row.enrichments_written ?? 0),
      errorMessage: row.error_message ?? null,
      metadata: row.metadata ?? {},
    }));
  } catch {
    return [];
  }
}

export function buildSourceHealthSnapshot(
  sources: SourceCatalogEntry[],
  outputs: MonitoringOutput[],
  runs: SourceConnectorRun[] = [],
): SourceHealthSnapshot {
  const rows = sources.map((source) => {
    const keys = sourceKeys(source);
    const sourceOutputs = outputs
      .filter((output) => intersects(outputSourceKeys(output), keys))
      .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt));
    const sourceRuns = runs
      .filter((run) => intersects(runSourceKeys(run), keys))
      .sort((a, b) => String(b.startedAt ?? '').localeCompare(String(a.startedAt ?? '')));
    const realOutputCount = sourceOutputs.filter((output) => output.connectorStatus === 'real').length;
    const partialOutputCount = sourceOutputs.length - realOutputCount;
    const averageConfidence = sourceOutputs.length
      ? Math.round((sourceOutputs.reduce((sum, output) => sum + Number(output.confidenceScore ?? 0), 0) / sourceOutputs.length) * 100)
      : 0;
    const official = isOfficialSource(source);
    const { decision, nextAction } = sourceDecision(source, sourceOutputs, sourceRuns, official);

    return {
      ...source,
      outputCount: sourceOutputs.length,
      realOutputCount,
      partialOutputCount,
      averageConfidence,
      lastOutputAt: sourceOutputs[0]?.collectedAt ?? null,
      lastOutputTitle: sourceOutputs[0]?.title ?? null,
      lastOutputStatus: sourceOutputs[0]?.connectorStatus ?? null,
      runCount: sourceRuns.length,
      lastRunAt: sourceRuns[0]?.startedAt ?? null,
      lastRunStatus: sourceRuns[0]?.status ?? null,
      lastRunError: sourceRuns[0]?.errorMessage ?? null,
      runOutputsWritten: sourceRuns.reduce((sum, run) => sum + run.outputsWritten, 0),
      runSignalsWritten: sourceRuns.reduce((sum, run) => sum + run.signalsWritten, 0),
      isOfficial: official,
      decision,
      nextAction,
    } satisfies SourceHealthRow;
  }).sort((a, b) => {
    if (Number(b.isOfficial) !== Number(a.isOfficial)) return Number(b.isOfficial) - Number(a.isOfficial);
    if (b.outputCount !== a.outputCount) return b.outputCount - a.outputCount;
    return a.name.localeCompare(b.name);
  });

  return {
    summary: {
      totalSources: sources.length,
      healthySources: sources.filter((source) => source.health === 'healthy').length,
      degradedSources: sources.filter((source) => source.health === 'degraded').length,
      downSources: sources.filter((source) => source.health === 'down').length,
      activeSources: sources.filter((source) => source.status === 'real').length,
      totalOutputs: outputs.length,
      realOutputs: outputs.filter((output) => output.connectorStatus === 'real').length,
      partialOutputs: outputs.filter((output) => output.connectorStatus !== 'real').length,
      officialSourcesObserved: rows.filter((source) => source.isOfficial && source.outputCount > 0).length,
      connectorRuns: runs.length,
      failedRuns: runs.filter((run) => run.status === 'failed').length,
    },
    sources: rows,
  };
}
