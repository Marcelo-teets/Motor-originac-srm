export const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value)));

export const average = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

export const isoNow = () => new Date().toISOString();

export const maturityToScore = (value: string) => {
  switch (value) {
    case 'high':
      return 90;
    case 'medium_high':
      return 78;
    case 'medium':
      return 65;
    default:
      return 45;
  }
};

export const levelFromScore = (score: number) => {
  if (score >= 80) return 'high';
  if (score >= 68) return 'medium_high';
  if (score >= 55) return 'medium';
  return 'low';
};

/** Like `Promise.all(items.map(task))` but with at most `limit` tasks in flight; preserves order. */
export const mapWithConcurrency = async <T, R>(items: readonly T[], limit: number, task: (item: T, index: number) => Promise<R>) => {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
};
