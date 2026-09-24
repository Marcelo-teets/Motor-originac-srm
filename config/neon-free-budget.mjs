// Free-plan limits are taken from the Motor project's 2026-09-24 Neon billing screenshot.
// Conservative guard: pause costly automatic work at 90%, before the requested 96% ceiling.
// These are LOCAL policy limits, not claims about enforceable Neon billing caps.
export const FREE_LIMITS = Object.freeze({
  storageBytes: 0.5 * 1024 ** 3,
  computeCuHours: 100,
  branches: 10,
  autoscaleMaxCu: 2,
});
export const ALERT_FRACTION = 0.8;
export const PAUSE_FRACTION = 0.9;
export const CEILING_FRACTION = 0.96;
const finite = (value) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null);
const metric = (name, value, limit) => {
  const n = finite(value);
  const ratio = n === null ? null : n / limit;
  return {
    name, value: n, limit, ratio,
    level: ratio === null ? 'unknown' :
      ratio >= CEILING_FRACTION ? 'critical' :
      ratio >= PAUSE_FRACTION ? 'pause' :
      ratio >= ALERT_FRACTION ? 'warning' : 'ok',
  };
};
export function evaluateNeonFree({ project, branches, endpoints }) {
  if (!project || !Array.isArray(branches) || !Array.isArray(endpoints)) {
    throw new Error('Invalid Neon management API payload; refusing to infer healthy usage');
  }
  const storage = finite(project.synthetic_storage_size);
  // synthetic_storage_size is a project snapshot. It may exclude some separately billed
  // history/snapshot overhead: never interpret this as an exact invoice-grade measurement.
  const computeSeconds = finite(project.compute_time_seconds);
  const activeBranches = branches.filter((b) => !b.deleted_at && !b.deleted);
  const branchMetric = metric('branches', activeBranches.length, FREE_LIMITS.branches);
  // Branches are integers: a 96% ceiling means at most 9 branches, not 9.6.
  if (activeBranches.length >= FREE_LIMITS.branches) branchMetric.level = 'critical';
  const maxCu = endpoints
    .filter(e => e.type === 'read_write' || e.type === 'read_only' || !e.type)
    .map(e => finite(e.autoscaling_limit_max_cu))
    .filter(n => n !== null);
  const invalidEndpoint = endpoints.some(e => finite(e.autoscaling_limit_max_cu) === null);
  const metrics = [
    metric('storageBytes', storage, FREE_LIMITS.storageBytes),
    metric('computeCuHours', computeSeconds === null ? null : computeSeconds / 3600, FREE_LIMITS.computeCuHours),
    branchMetric,
    metric('peakConfiguredCu', invalidEndpoint ? null : maxCu.length ? Math.max(...maxCu) : null, FREE_LIMITS.autoscaleMaxCu),
  ];
  // Peak configured CU is a configuration ceiling, not monthly consumption.
  // A 1.5 CU cap stays below 96% of the plan's 2 CU ceiling.
  const pendingUnknown = metrics.some(m => m.level === 'unknown');
  const hasCritical = metrics.some(m => m.level === 'critical');
  const hasPause = metrics.some(m => m.level === 'pause');
  const hasWarning = metrics.some(m => m.level === 'warning');
  const level = hasCritical ? 'critical' : pendingUnknown ? 'unknown' : hasPause ? 'pause' : hasWarning ? 'warning' : 'ok';
  return {
    projectId: project.id,
    level, metrics,
    allowNewHeavyWork: level === 'ok' || level === 'warning',
    allowNewBranches: activeBranches.length < 9 && !pendingUnknown && !hasCritical,
    // These are not reliable without current Free-plan accounting telemetry.
    billingGradeStorageVerified: false,
    computeBillingPeriodVerified: Boolean(project.consumption_period_start && project.consumption_period_end),
  };
}
