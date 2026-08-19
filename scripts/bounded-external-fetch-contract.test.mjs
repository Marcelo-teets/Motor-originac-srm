import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fetchGuard = await readFile(new URL('../backend/src/lib/boundedExternalFetch.ts', import.meta.url), 'utf8');
const runner = await readFile(new URL('../serverless/bounded-capture-run.ts', import.meta.url), 'utf8');

test('uses request-local storage instead of a process-wide mutable timeout', () => {
  assert.match(fetchGuard, /AsyncLocalStorage/);
  assert.match(fetchGuard, /storage\.run\(timeoutMs, task\)/);
});

test('caps each external fetch below the overall 24s capture budget', () => {
  assert.match(fetchGuard, /BOUNDED_EXTERNAL_FETCH_TIMEOUT_MS = 6_000/);
  assert.match(fetchGuard, /AbortSignal\.timeout\(timeoutMs\)/);
  assert.match(fetchGuard, /AbortSignal\.any/);
});

test('bounded capture runner wraps the existing global deadline with the fetch guard', () => {
  assert.match(runner, /withBoundedExternalFetch/);
  assert.match(runner, /withCaptureDeadline\(runtime\.run/);
  assert.match(runner, /externalFetchTimeoutMs: BOUNDED_EXTERNAL_FETCH_TIMEOUT_MS/);
  assert.match(runner, /bounded-capture-run-v2/);
});
