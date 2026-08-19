import type { CompanySeed, SourceCatalogEntry } from '../types/platform.js';
import { isCompanyMonitoringEligible } from './companyDecisionEligibility.js';

export const CAPTURE_RUNTIME_BUDGET_MS = 24_000;

export type CaptureCadence = 'frequent' | 'daily' | 'weekly' | 'monthly' | 'all';

export type BoundedCaptureTarget = {
  companyId: string;
  companyName: string;
  sourceId: string;
  sourceName: string;
};

export class CaptureRuntimeDeadlineError extends Error {
  readonly statusCode = 504;
  readonly code = 'capture_runtime_deadline_exceeded';

  constructor(readonly budgetMs: number) {
    super(`Capture runtime exceeded the ${budgetMs}ms serverless budget.`);
  }
}

export const selectMonitoringCompanies = (companies: CompanySeed[], useSupabase: boolean) => (
  useSupabase ? companies.filter(isCompanyMonitoringEligible) : companies
);

const schedulePolicy = (source: SourceCatalogEntry) => {
  const candidate = source.metadata?.schedulePolicy;
  return candidate && typeof candidate === 'object' ? candidate as Record<string, unknown> : null;
};

export const selectCaptureSources = (sources: SourceCatalogEntry[], cadence: CaptureCadence = 'all') => sources.filter((source) => {
  const status = String(source.status);
  const statusEligible = status === 'real' || status === 'partial' || status === 'active';
  if (!statusEligible || source.health !== 'healthy') return false;

  // Catalog entries may remain useful for analyst/manual research while an automated runtime
  // is intentionally not implemented. Never schedule those entries just because a legacy
  // schedulePolicy is still present.
  if (source.metadata?.implementedRuntime === false) return false;

  const policy = schedulePolicy(source);
  if (!policy) return cadence === 'all';
  if (policy.enabled === false || policy.runner !== 'bounded_capture') return false;
  return cadence === 'all' || policy.cadence === cadence;
});

export const buildBoundedCaptureTargets = (
  companies: CompanySeed[],
  sources: SourceCatalogEntry[],
  useSupabase: boolean,
  cadence: CaptureCadence = 'all',
): BoundedCaptureTarget[] => {
  const eligibleCompanies = selectMonitoringCompanies(companies, useSupabase);
  const eligibleSources = selectCaptureSources(sources, cadence);
  return eligibleCompanies.flatMap((company) => eligibleSources.map((source) => ({
    companyId: company.id,
    companyName: company.tradeName,
    sourceId: source.id,
    sourceName: source.name,
  })));
};

export const assertBoundedCaptureScope = (companyId?: string | null, sourceId?: string | null) => {
  if (!companyId || !sourceId) {
    const error = new Error('Bounded capture requires both companyId and sourceId.');
    Object.assign(error, { statusCode: 400, code: 'bounded_capture_scope_required' });
    throw error;
  }
};

export async function withCaptureDeadline<T>(task: Promise<T>, budgetMs = CAPTURE_RUNTIME_BUDGET_MS): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new CaptureRuntimeDeadlineError(budgetMs)), budgetMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
