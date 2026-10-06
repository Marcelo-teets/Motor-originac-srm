import test from 'node:test';
import assert from 'node:assert/strict';
import { env } from './env.js';
import { getMaisRetornoQuotaStatus, quotaEnvelopeStatus } from './maisRetorno.js';

test('quotaEnvelopeStatus maps neon mode to real', () => {
  assert.equal(quotaEnvelopeStatus('neon'), 'real');
});

test('quotaEnvelopeStatus maps memory fallback to partial', () => {
  assert.equal(quotaEnvelopeStatus('memory'), 'partial');
});

test('quota status keeps evidence contract coherent with the resolved mode', async () => {
  const quota = await getMaisRetornoQuotaStatus();
  assert.equal(quota.provider, 'mais_retorno');
  assert.ok(quota.monthlyQuota <= 500);
  assert.equal(quotaEnvelopeStatus(quota.mode), quota.mode === 'neon' ? 'real' : 'partial');

  const hasNeonCredentials = Boolean(env.neonDatabaseUrl);
  if (!hasNeonCredentials) {
    assert.equal(quota.mode, 'memory');
    assert.equal(quotaEnvelopeStatus(quota.mode), 'partial');
  }
});
