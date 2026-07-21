import test from 'node:test';
import assert from 'node:assert/strict';
import { getBuildInfo } from './buildInfo.js';
import { agentHealthSummary, agentDefinitions } from '../modules/agents.js';

test('getBuildInfo prefers Vercel metadata and falls back cleanly', () => {
  const vercel = getBuildInfo({
    VERCEL_GIT_COMMIT_SHA: 'abc123',
    VERCEL_ENV: 'production',
    VERCEL_DEPLOYMENT_ID: 'dpl_1',
    VERCEL_URL: 'motor.vercel.app',
  } as NodeJS.ProcessEnv);
  assert.deepEqual(vercel, { gitSha: 'abc123', environment: 'production', deploymentId: 'dpl_1', deploymentUrl: 'motor.vercel.app' });

  const local = getBuildInfo({ NODE_ENV: 'test' } as NodeJS.ProcessEnv);
  assert.equal(local.gitSha, 'unknown');
  assert.equal(local.environment, 'test');
  assert.equal(local.deploymentId, null);
});

test('agentHealthSummary derives counts from declared definitions, never hard-coded', () => {
  const summary = agentHealthSummary();
  assert.equal(summary.total, agentDefinitions.length);
  assert.equal(summary.healthy + summary.degraded + summary.mocked, agentDefinitions.length);
  assert.equal(summary.healthy, agentDefinitions.filter((agent) => agent.status === 'real').length);
  assert.equal(summary.derivedFrom, 'agent_definitions');
});

test('in-memory agents never declare themselves real (P0 truthfulness)', () => {
  for (const name of ['aba_build_agent', 'paper_clip_agent', 'adm_agent']) {
    const agent = agentDefinitions.find((item) => item.name === name);
    assert.ok(agent, `missing agent ${name}`);
    assert.notEqual(agent.status, 'real', `${name} runs in memory and must not claim real`);
  }
});
