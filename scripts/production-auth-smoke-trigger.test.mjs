import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Auth smoke does not run on untrusted deployment status SHAs', () => {
  const auth = readFileSync('.github/workflows/production-auth-smoke.yml', 'utf8');
  const deploy = readFileSync('.github/workflows/vercel-production-deploy.yml', 'utf8');
  assert.match(auth, /workflow_dispatch:/);
  assert.doesNotMatch(auth, /deployment_status:/);
  assert.doesNotMatch(auth, /github\.event\.deployment\.sha/);
  assert.match(auth, /EXPECTED_SHA:.*inputs\.expected_sha/);
  assert.match(auth, /Run production Auth smoke[\s\S]*scripts\/smoke-auth-production\.mjs/);
  assert.match(deploy, /Validate canonical production Auth rollout[\s\S]*scripts\/smoke-auth-production\.mjs/);
  assert.match(deploy, /EXPECTED_SHA="\$REQUESTED_SHA"/);
});
