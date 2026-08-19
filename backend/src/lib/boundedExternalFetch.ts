import { AsyncLocalStorage } from 'node:async_hooks';

const STORAGE_KEY = Symbol.for('motor.origination.boundedExternalFetch.storage');
const PATCHED_KEY = Symbol.for('motor.origination.boundedExternalFetch.patched');

type BoundedFetchGlobal = typeof globalThis & {
  [STORAGE_KEY]?: AsyncLocalStorage<number>;
  [PATCHED_KEY]?: boolean;
};

const boundedGlobal = globalThis as BoundedFetchGlobal;
const storage = boundedGlobal[STORAGE_KEY] ?? new AsyncLocalStorage<number>();
boundedGlobal[STORAGE_KEY] = storage;

if (!boundedGlobal[PATCHED_KEY]) {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const timeoutMs = storage.getStore();
    if (!timeoutMs) return nativeFetch(input, init);

    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = init.signal
      ? AbortSignal.any([init.signal, timeoutSignal])
      : timeoutSignal;

    return nativeFetch(input, { ...init, signal });
  }) as typeof globalThis.fetch;
  boundedGlobal[PATCHED_KEY] = true;
}

export const BOUNDED_EXTERNAL_FETCH_TIMEOUT_MS = 6_000;

export const withBoundedExternalFetch = async <T>(
  task: () => Promise<T>,
  timeoutMs = BOUNDED_EXTERNAL_FETCH_TIMEOUT_MS,
): Promise<T> => storage.run(timeoutMs, task);
