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
