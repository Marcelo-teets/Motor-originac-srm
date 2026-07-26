import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../api/agentetome.ts', import.meta.url), 'utf8');

assert.match(
  source,
  /req\.headers\['x-vercel-oidc-token'\]/,
  'the production worker must read the request-scoped Vercel OIDC token',
);
assert.match(
  source,
  /process\.env\.AI_GATEWAY_API_KEY/,
  'an explicit AI Gateway API key must remain supported',
);
assert.match(
  source,
  /AI Gateway credential unavailable before claiming learning jobs/,
  'missing gateway credentials must fail before queue jobs are claimed',
);
assert.match(
  source,
  /withKnowledgeGatewayCredential\(req, \(\) => learning\.runKnowledgeLearningAgent/,
  'the learning worker must execute inside the request-scoped credential bridge',
);
assert.match(
  source,
  /finally \{[\s\S]*delete process\.env\.VERCEL_OIDC_TOKEN;/,
  'a bridged request token must be removed after the invocation',
);
assert.match(
  source,
  /gatewayCredential: process\.env\.AI_GATEWAY_API_KEY \? 'api_key' : 'vercel_oidc_request'/,
  'the run audit must record which credential path was used without storing the token',
);

const credentialGuardIndex = source.indexOf('AI Gateway credential unavailable before claiming learning jobs');
const claimInvocationIndex = source.indexOf('learning.runKnowledgeLearningAgent');
assert.ok(
  credentialGuardIndex >= 0 && credentialGuardIndex < claimInvocationIndex,
  'gateway credential validation must occur before the agent can claim queue jobs',
);

console.log('Knowledge Learning Agent OIDC credential contract is protected.');
