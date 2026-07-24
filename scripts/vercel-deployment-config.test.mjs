import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const deploymentEnabled = config.git?.deploymentEnabled;

assert.equal(typeof deploymentEnabled, 'object', 'git.deploymentEnabled must be an object');
assert.equal(deploymentEnabled['*'], false, 'all unspecified branches must be disabled before deployment creation');
assert.equal(deploymentEnabled.main, true, 'main must retain automatic production deployments');
assert.equal(deploymentEnabled['preview/*'], true, 'preview/* must remain available for explicit previews');
assert.equal(deploymentEnabled['release/*'], true, 'release/* must remain available for release validation');

assert.equal(
  config.ignoreCommand,
  'bash scripts/vercel-ignore-build.sh',
  'the secondary Ignore Build Step guard must remain versioned',
);

console.log('Vercel pre-deployment branch rules: configuration valid.');
