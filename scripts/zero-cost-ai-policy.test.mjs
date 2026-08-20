import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const QUARANTINED_LEGACY_FILE = 'backend/src/ai/knowledgeLearningAgent.ts';
const PAID_ENDPOINT_MARKERS = [
  'api.openai.com',
  'api.anthropic.com',
  'ai-gateway.vercel.sh',
];
const PAID_SECRET_MARKERS = [
  'OPENAI_API_KEY=',
  'ANTHROPIC_API_KEY=',
  'AI_GATEWAY_API_KEY=',
];

const read = (relativePath) => readFile(path.join(ROOT, relativePath), 'utf8');

const walk = async (relativeDir) => {
  const absolute = path.join(ROOT, relativeDir);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(relativeDir, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory()) files.push(...await walk(relative));
    else files.push(relative);
  }
  return files;
};

test('zero-cost policy removes paid AI credentials from example configuration', async () => {
  const envExample = await read('.env.example');
  assert.match(envExample, /ZERO_COST_AI_POLICY=locked/);
  assert.match(envExample, /FREE_INFERENCE_BASE_URL=/);
  for (const marker of PAID_SECRET_MARKERS) {
    assert.equal(envExample.includes(marker), false, `${marker} must not be advertised while zero-cost policy is locked`);
  }
});

test('active AI entrypoints contain no paid provider endpoint', async () => {
  const activeFiles = [
    'api/task-ai.ts',
    'api/public-data-operations.ts',
    'backend/src/ai/aiGateway.ts',
  ];
  for (const file of activeFiles) {
    const source = await read(file);
    for (const marker of PAID_ENDPOINT_MARKERS) {
      assert.equal(source.includes(marker), false, `${file} must not reference paid endpoint ${marker}`);
    }
  }
});

test('knowledge learning paid implementation is quarantined from runtime', async () => {
  const roots = ['api', 'backend/src', 'serverless'];
  const candidateFiles = (await Promise.all(roots.map(walk))).flat()
    .filter((file) => /\.(?:ts|js|mjs)$/.test(file))
    .filter((file) => file !== QUARANTINED_LEGACY_FILE)
    .filter((file) => !file.endsWith('.test.ts'));

  for (const file of candidateFiles) {
    const source = await read(file);
    assert.equal(
      source.includes("import('../backend/src/ai/knowledgeLearningAgent.js')"),
      false,
      `${file} must not dynamically import quarantined paid knowledge learning runtime`,
    );
    assert.equal(
      source.includes('runKnowledgeLearningAgent('),
      false,
      `${file} must not invoke quarantined paid knowledge learning runtime`,
    );
  }

  const agentetome = await read('api/agentetome.ts');
  assert.match(agentetome, /policy: ZERO_COST_POLICY/);
  assert.match(agentetome, /paidProviderAttempted: false/);
});

test('scheduled knowledge learning is disabled while zero-cost policy is locked', async () => {
  const workflow = await read('.github/workflows/knowledge-learning-agent.yml');
  assert.equal(/\n\s*schedule\s*:/.test(workflow), false, 'knowledge learning schedule must remain disabled');
  assert.equal(workflow.includes('/api/knowledge-learning-agent'), false, 'workflow must not invoke learning endpoint');
  assert.match(workflow, /zero-cost lock active/);
});

test('provider canary verifies policy without paid inference probes', async () => {
  const workflow = await read('.github/workflows/provider-runtime-canary.yml');
  for (const marker of PAID_ENDPOINT_MARKERS) {
    assert.equal(workflow.includes(marker), false, `provider canary must not reference ${marker}`);
  }
  assert.match(workflow, /Expected policy lock HTTP 423/);
  assert.match(workflow, /paidProviderAttempted/);
});
