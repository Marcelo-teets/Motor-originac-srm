import assert from 'node:assert/strict';
import test from 'node:test';
import type { SourceCatalogEntry } from '../types/platform.js';
import { selectCaptureSources } from './boundedCapture.js';

const source = (input: {
  id: string;
  status?: string;
  health?: string;
  runner?: string;
  cadence?: string;
  enabled?: boolean;
  implementedRuntime?: boolean;
}) => ({
  id: input.id,
  name: input.id,
  sourceType: 'rss',
  category: 'news',
  status: input.status ?? 'real',
  health: input.health ?? 'healthy',
  metadata: {
    ...(input.implementedRuntime === undefined ? {} : { implementedRuntime: input.implementedRuntime }),
    schedulePolicy: {
      runner: input.runner ?? 'bounded_capture',
      cadence: input.cadence ?? 'daily',
      enabled: input.enabled ?? true,
    },
  },
}) as SourceCatalogEntry;

test('selects only sources assigned to the requested bounded-capture cadence', () => {
  const selected = selectCaptureSources([
    source({ id: 'frequent', cadence: 'frequent' }),
    source({ id: 'daily', cadence: 'daily' }),
    source({ id: 'weekly', cadence: 'weekly' }),
    source({ id: 'capital-market', runner: 'capital_market', cadence: 'daily' }),
    source({ id: 'disabled', cadence: 'daily', enabled: false }),
  ], 'daily');

  assert.deepEqual(selected.map((item) => item.id), ['daily']);
});

test('keeps partial and active healthy sources eligible for scheduled recovery', () => {
  const selected = selectCaptureSources([
    source({ id: 'partial', status: 'partial', cadence: 'weekly' }),
    source({ id: 'active', status: 'active', cadence: 'weekly' }),
    source({ id: 'degraded', status: 'real', health: 'degraded', cadence: 'weekly' }),
  ], 'weekly');

  assert.deepEqual(selected.map((item) => item.id), ['partial', 'active']);
});

test('never schedules a source explicitly marked as runtime-not-implemented', () => {
  const selected = selectCaptureSources([
    source({ id: 'implemented', status: 'partial', cadence: 'daily', implementedRuntime: true }),
    source({ id: 'manual-only', status: 'partial', cadence: 'daily', implementedRuntime: false }),
  ], 'daily');

  assert.deepEqual(selected.map((item) => item.id), ['implemented']);
});
