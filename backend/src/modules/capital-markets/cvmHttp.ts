const DEFAULT_ATTEMPTS = 5;
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_BASE_DELAY_MS = 1_000;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export type CvmFetchRetryOptions = {
  attempts?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
  label?: string;
  fetchImpl?: typeof fetch;
  sleepImpl?: (milliseconds: number) => Promise<void>;
};

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export const isRetryableCvmStatus = (status: number) => RETRYABLE_STATUS.has(status);

export const describeCvmFetchError = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error);
  const details = [error.message];
  let cause = error.cause;
  const seen = new Set<unknown>();

  while (cause && !seen.has(cause)) {
    seen.add(cause);
    if (cause instanceof Error) {
      const code = 'code' in cause && typeof cause.code === 'string' ? ` [${cause.code}]` : '';
      details.push(`${cause.message}${code}`);
      cause = cause.cause;
    } else if (typeof cause === 'object' && cause !== null) {
      const record = cause as Record<string, unknown>;
      const message = typeof record.message === 'string' ? record.message : JSON.stringify(record);
      const code = typeof record.code === 'string' ? ` [${record.code}]` : '';
      details.push(`${message}${code}`);
      cause = record.cause;
    } else {
      details.push(String(cause));
      break;
    }
  }

  return [...new Set(details.filter(Boolean))].join(' <- ');
};

const mergeHeaders = (headers?: HeadersInit) => {
  const merged = new Headers(headers);
  if (!merged.has('user-agent')) merged.set('user-agent', 'Motor-Origination/1.0');
  if (!merged.has('connection')) merged.set('connection', 'close');
  return merged;
};

const readResponseExcerpt = async (response: Response) => {
  try {
    return (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 500);
  } catch {
    return '';
  }
};

export const fetchCvmWithRetry = async (
  url: string,
  init: RequestInit = {},
  options: CvmFetchRetryOptions = {},
): Promise<Response> => {
  const attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS);
  const timeoutMs = Math.max(1_000, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? sleep;
  const label = options.label ?? url;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        ...init,
        headers: mergeHeaders(init.headers),
        signal: init.signal ?? AbortSignal.timeout(timeoutMs),
      });

      if (response.ok || !isRetryableCvmStatus(response.status)) return response;

      const excerpt = await readResponseExcerpt(response);
      lastError = new Error(
        `HTTP ${response.status}${excerpt ? `: ${excerpt}` : ''}`,
      );
    } catch (error) {
      lastError = error;
    }

    if (attempt < attempts) {
      const delay = Math.min(baseDelayMs * (2 ** (attempt - 1)), 10_000);
      await sleepImpl(delay);
    }
  }

  throw new Error(
    `CVM request ${label} failed after ${attempts} attempts: ${describeCvmFetchError(lastError)}`,
  );
};
