import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../api/agentetome.ts', import.meta.url), 'utf8');

assert.doesNotMatch(
  source,
  /x-vercel-oidc-token|AI_GATEWAY_API_KEY|runKnowledgeLearningAgent|knowledgeLearningAgent\.js/,
  'paid Knowledge Learning credentials/runtime must remain disconnected while zero-cost policy is locked',
);
assert.match(
  source,
  /operation === 'knowledge-learning'/,
  'knowledge-learning entrypoint must remain explicit so the policy lock is observable',
);
assert.match(
  source,
  /return writeJson\(res, 423/,
  'knowledge-learning requests must fail closed with the zero-cost policy lock',
);
assert.match(
  source,
  /policy: ZERO_COST_POLICY/,
  'policy lock must be reported by the runtime',
);
assert.match(
  source,
  /paidProviderAttempted: false/,
  'runtime must prove that no paid provider was attempted',
);

console.log('Knowledge Learning Agent paid-provider lock is protected.');
