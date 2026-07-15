import type { MonitoringOutput } from '../../types/platform.js';

const nonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const hasUsefulItem = (value: unknown) => Array.isArray(value) && value.some((item) => {
  if (!item || typeof item !== 'object') return false;
  const record = item as Record<string, unknown>;
  return [record.title, record.description, record.summary, record.snippet].some(nonEmptyString);
});

const hasUsefulRows = (value: unknown) => Array.isArray(value) && value.length > 0;

const hasUsefulObject = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.fallback === true || nonEmptyString(record.error)) return false;
  return Object.entries(record).some(([key, field]) => !['fallback', 'error'].includes(key)
    && field !== null
    && field !== undefined
    && field !== '');
};

/**
 * A successful HTTP response is not evidence by itself. This guard requires
 * business content and deliberately ignores query URLs, connector metadata,
 * errors and fallbacks so empty captures cannot affect scores or dashboards.
 */
export const isProbativeMonitoringOutput = (output: MonitoringOutput) => {
  if (output.connectorStatus !== 'real') return false;

  const payload = output.normalizedPayload ?? {};
  if (payload.fallback === true || nonEmptyString(payload.error)) return false;

  if ('items' in payload) return hasUsefulItem(payload.items);
  if ('rows' in payload) return hasUsefulRows(payload.rows);
  if ('resources' in payload) return hasUsefulRows(payload.resources);
  if ('payload' in payload) return hasUsefulObject(payload.payload);
  if ('bodyText' in payload || 'headings' in payload) {
    return nonEmptyString(payload.bodyText)
      || (Array.isArray(payload.headings) && payload.headings.some(nonEmptyString));
  }

  return nonEmptyString(output.summary)
    && !/sem conte[uú]do|sem evid[eê]ncia|fallback|empty[_ ]feed/i.test(output.summary);
};

export const outputPublishedAt = (output: MonitoringOutput) => {
  const payload = output.normalizedPayload ?? {};
  const firstItem = Array.isArray(payload.items) && payload.items[0] && typeof payload.items[0] === 'object'
    ? payload.items[0] as Record<string, unknown>
    : undefined;

  for (const value of [firstItem?.publishedAt, payload.publishedAt]) {
    if (nonEmptyString(value)) return value.trim();
  }

  return output.collectedAt;
};
