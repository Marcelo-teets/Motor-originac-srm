import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createPlatformRepository } from '../../backend/src/repositories/platformRepository.js';
import { CaptureRuntimeService } from '../../backend/src/services/captureRuntimeService.js';
import {
  buildBoundedCaptureTargets,
  type BoundedCaptureTarget,
  type CaptureCadence,
} from '../../backend/src/lib/boundedCapture.js';
import {
  BOUNDED_EXTERNAL_FETCH_TIMEOUT_MS,
  withBoundedExternalFetch,
} from '../../backend/src/lib/boundedExternalFetch.js';
import { writeCaptureAudit } from '../../backend/src/lib/captureAudit.js';

const asPositiveInteger = (value: string | undefined, fallback: number, max = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
};

const asCadence = (value: string | undefined): CaptureCadence => {
  const normalized = String(value ?? 'all').trim().toLowerCase();
  return ['frequent', 'daily', 'weekly', 'monthly', 'all'].includes(normalized)
    ? normalized as CaptureCadence
    : 'all';
};

const requireProductionPersistence = () => {
  if (process.env.USE_SUPABASE !== 'true') throw new Error('USE_SUPABASE=true is required for scheduled capture.');
  if (!process.env.SUPABASE_URL) throw new Error('SUPABASE_URL is required for scheduled capture.');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for scheduled capture.');
};

const diversifyBySource = (targets: BoundedCaptureTarget[]) => {
  const firstBySource = new Map<string, BoundedCaptureTarget>();
  const remainder: BoundedCaptureTarget[] = [];
  for (const target of targets) {
    if (!firstBySource.has(target.sourceId)) firstBySource.set(target.sourceId, target);
    else remainder.push(target);
  }
  return [...firstBySource.values(), ...remainder];
};

type TargetResult = {
  companyId: string;
  companyName: string;
  sourceId: string;
  sourceName: string;
  status: 'completed' | 'partial' | 'failed';
  durationMs: number;
  outputsWritten: number;
  signalsWritten: number;
  enrichmentsWritten: number;
  error?: string;
};

const safeAudit = async (input: Parameters<typeof writeCaptureAudit>[0]) => {
  try {
    await writeCaptureAudit(input);
  } catch (error) {
    console.warn('[direct-capture-audit]', error instanceof Error ? error.message : String(error));
  }
};

const renderSummary = (cadence: CaptureCadence, allTargets: number, selectedTargets: number, results: TargetResult[]) => {
  const completed = results.filter((item) => item.status === 'completed').length;
  const partial = results.filter((item) => item.status === 'partial').length;
  const failed = results.filter((item) => item.status === 'failed').length;
  const lines = [
    '## Direct bounded capture',
    '',
    `- cadence: ${cadence}`,
    `- eligible targets: ${allTargets}`,
    `- executed targets: ${selectedTargets}`,
    `- completed: ${completed}`,
    `- partial: ${partial}`,
    `- failed: ${failed}`,
    `- external fetch deadline: ${BOUNDED_EXTERNAL_FETCH_TIMEOUT_MS}ms`,
    '',
    '| status | company | source | duration ms | outputs | signals | enrichments |',
    '|---|---|---|---:|---:|---:|---:|',
    ...results.map((item) => `| ${item.status} | ${item.companyName.replaceAll('|', '/')} | ${item.sourceName.replaceAll('|', '/')} | ${item.durationMs} | ${item.outputsWritten} | ${item.signalsWritten} | ${item.enrichmentsWritten} |`),
    '',
  ];
  return { text: lines.join('\n'), completed, partial, failed };
};

export const runDirectCaptureBatch = async () => {
  requireProductionPersistence();
  const cadence = asCadence(process.env.CAPTURE_CADENCE);
  const parallelism = asPositiveInteger(process.env.MAX_PARALLELISM, 3, 8);
  const targetCap = asPositiveInteger(process.env.MAX_CAPTURE_TARGETS, Number.MAX_SAFE_INTEGER, 10_000);
  const release = String(process.env.CAPTURE_RELEASE ?? 'direct-github-runner-v1');

  const repository = createPlatformRepository('supabase');
  const runtime = new CaptureRuntimeService(repository);
  const [companies, sources] = await Promise.all([
    repository.listCompanies(),
    repository.listSources(),
  ]);

  const allTargets = buildBoundedCaptureTargets(companies, sources, true, cadence);
  const targets = diversifyBySource(allTargets).slice(0, targetCap);
  console.log(JSON.stringify({
    event: 'direct_capture_start',
    cadence,
    release,
    companies: new Set(targets.map((item) => item.companyId)).size,
    sources: new Set(targets.map((item) => item.sourceId)).size,
    eligibleTargets: allTargets.length,
    selectedTargets: targets.length,
    parallelism,
  }));

  const results: TargetResult[] = [];
  let cursor = 0;

  const worker = async (workerId: number) => {
    while (true) {
      const index = cursor;
      cursor += 1;
      const target = targets[index];
      if (!target) return;

      const startedAt = new Date().toISOString();
      const startedMs = Date.now();
      try {
        const result = await withBoundedExternalFetch(() => runtime.run({
          companyId: target.companyId,
          sourceId: target.sourceId,
          triggerType: 'cron',
          reason: `github_actions_direct_capture:${release}`,
        }));
        const persistedErrors = Array.isArray(result.persisted.errors) ? result.persisted.errors : [];
        const status: TargetResult['status'] = result.persisted.status === 'real' && persistedErrors.length === 0
          ? 'completed'
          : 'partial';
        const finishedAt = new Date().toISOString();
        const errorMessage = persistedErrors.length ? persistedErrors.slice(0, 3).join(' | ') : undefined;

        await safeAudit({
          triggerType: 'cron',
          status,
          startedAt,
          finishedAt,
          companyId: target.companyId,
          sourceId: target.sourceId,
          itemsCollected: result.outputsCollected,
          outputsWritten: result.persisted.outputsWritten,
          signalsWritten: result.persisted.signalsWritten,
          enrichmentsWritten: result.persisted.enrichmentsWritten,
          errorMessage: errorMessage ?? null,
          metadata: {
            auditVersion: 'github_actions_direct_capture_v1',
            runtime: 'github-actions-direct',
            release,
            workerId,
            cadence,
            externalFetchTimeoutMs: BOUNDED_EXTERNAL_FETCH_TIMEOUT_MS,
            requested: result.requested,
            companiesProcessed: result.companiesProcessed,
            documentsCollected: result.documentsCollected,
            persisted: result.persisted,
          },
        });

        results.push({
          ...target,
          status,
          durationMs: Date.now() - startedMs,
          outputsWritten: result.persisted.outputsWritten,
          signalsWritten: result.persisted.signalsWritten,
          enrichmentsWritten: result.persisted.enrichmentsWritten,
          ...(errorMessage ? { error: errorMessage } : {}),
        });
      } catch (error) {
        const finishedAt = new Date().toISOString();
        const errorMessage = error instanceof Error ? error.message : String(error);
        await safeAudit({
          triggerType: 'cron',
          status: 'failed',
          startedAt,
          finishedAt,
          companyId: target.companyId,
          sourceId: target.sourceId,
          errorMessage,
          metadata: {
            auditVersion: 'github_actions_direct_capture_v1',
            runtime: 'github-actions-direct',
            release,
            workerId,
            cadence,
            externalFetchTimeoutMs: BOUNDED_EXTERNAL_FETCH_TIMEOUT_MS,
          },
        });
        results.push({
          ...target,
          status: 'failed',
          durationMs: Date.now() - startedMs,
          outputsWritten: 0,
          signalsWritten: 0,
          enrichmentsWritten: 0,
          error: errorMessage,
        });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(parallelism, Math.max(1, targets.length)) }, (_, index) => worker(index + 1)));
  results.sort((a, b) => a.sourceName.localeCompare(b.sourceName) || a.companyName.localeCompare(b.companyName));
  const summary = renderSummary(cadence, allTargets.length, targets.length, results);
  console.log(summary.text);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary.text}\n`, 'utf8');

  if (summary.failed > 0 || summary.partial > 0) {
    const failures = results.filter((item) => item.status !== 'completed').map((item) => ({
      status: item.status,
      company: item.companyName,
      source: item.sourceName,
      error: item.error,
    }));
    console.error(JSON.stringify({ event: 'direct_capture_failed', failures }, null, 2));
    process.exitCode = 1;
  }
};

const isDirectExecution = Boolean(
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href,
);

if (isDirectExecution) {
  runDirectCaptureBatch().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
