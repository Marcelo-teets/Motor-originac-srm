export type FetchPolicy = {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
};

const DEFAULT_TIMEOUT_MS = 20_000;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const isIdempotentMethod = (method: string) => method === 'GET' || method === 'HEAD' || method === 'OPTIONS';

export class RequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`A operação excedeu ${Math.round(timeoutMs / 1_000)} segundos. Tente novamente.`);
    this.name = 'RequestTimeoutError';
  }
}

export async function fetchWithPolicy(
  input: RequestInfo | URL,
  init: RequestInit = {},
  policy: FetchPolicy = {},
): Promise<Response> {
  const method = String(init.method ?? 'GET').toUpperCase();
  const timeoutMs = policy.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = isIdempotentMethod(method) ? Math.max(0, policy.retries ?? 1) : 0;
  const retryDelayMs = Math.max(100, policy.retryDelayMs ?? 350);
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    let timedOut = false;
    const callerSignal = init.signal;
    const abortFromCaller = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) abortFromCaller();
    else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });

    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      if (attempt < retries && RETRYABLE_STATUS.has(response.status)) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (callerSignal?.aborted) throw error;
      if (timedOut && attempt >= retries) throw new RequestTimeoutError(timeoutMs);
      if (attempt >= retries) {
        if (error instanceof TypeError) {
          throw new Error('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
        }
        throw error;
      }
      await sleep(retryDelayMs * (attempt + 1));
    } finally {
      window.clearTimeout(timeoutId);
      callerSignal?.removeEventListener('abort', abortFromCaller);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Falha inesperada de comunicação com o servidor.');
}

export function safeResponsePreview(raw: string, maxLength = 120) {
  const normalized = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized.slice(0, maxLength);
}
