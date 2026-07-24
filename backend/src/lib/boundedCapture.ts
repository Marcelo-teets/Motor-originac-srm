import type { CompanySeed, SourceCatalogEntry } from '../types/platform.js';
import { isCompanyMonitoringEligible } from './companyDecisionEligibility.js';

export const CAPTURE_RUNTIME_BUDGET_MS = 24_000;

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

export const selectCaptureSources = (sources: SourceCatalogEntry[]) => sources.filter((source) => (
  source.status === 'real' && source.health === 'healthy'
));

export const buildBoundedCaptureTargets = (
  companies: CompanySeed[],
  sources: SourceCatalogEntry[],
  useSupabase: boolean,
): BoundedCaptureTarget[] => {
  const eligibleCompanies = selectMonitoringCompanies(companies, useSupabase);
  const eligibleSources = selectCaptureSources(sources);
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
