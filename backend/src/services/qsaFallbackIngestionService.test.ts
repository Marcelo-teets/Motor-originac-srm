import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldUseQsaFallback } from './qsaFallbackIngestionService.js';

test('uses fallback while official bulk is degraded or incomplete', () => {
  assert.equal(shouldUseQsaFallback({
    id: 'official',
    status: 'partial',
    health: 'degraded',
    metadata: { officialBulkHealth: 'degraded', fullCoverageAchieved: false },
  }), true);

  assert.equal(shouldUseQsaFallback({
    id: 'official',
    status: 'real',
    health: 'healthy',
    metadata: { fullCoverageAchieved: false },
  }), true);
});

test('does not call fallback when official bulk is healthy and complete', () => {
  assert.equal(shouldUseQsaFallback({
    id: 'official',
    status: 'real',
    health: 'healthy',
    metadata: { officialBulkHealth: 'healthy', fullCoverageAchieved: true },
  }), false);
});

test('force mode and missing official source activate fallback', () => {
  assert.equal(shouldUseQsaFallback(null), true);
  assert.equal(shouldUseQsaFallback({
    id: 'official',
    status: 'real',
    health: 'healthy',
    metadata: { fullCoverageAchieved: true },
  }, true), true);
});
