import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const deploymentEnabled = config.git?.deploymentEnabled;

assert.equal(typeof deploymentEnabled, 'object', 'git.deploymentEnabled must be an object');
assert.deepEqual(
  deploymentEnabled,
  { '*': false },
  'all Git-triggered deployments must be disabled; production is published only by the controlled prebuilt workflow',
);

assert.equal(
  config.ignoreCommand,
  'bash scripts/vercel-ignore-build.sh',
  'the secondary Ignore Build Step guard must remain versioned',
);

for (const [functionPath, settings] of Object.entries(config.functions ?? {})) {
  assert.equal(
    Object.prototype.hasOwnProperty.call(settings, 'memory'),
    false,
    `${functionPath} must not declare ignored memory settings under Active CPU billing`,
  );
}

console.log('Vercel pre-deployment rules: Git deploys disabled and function settings are effective.');
