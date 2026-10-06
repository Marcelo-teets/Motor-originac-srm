import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCliArgs } from './args.js';

test('parseCliArgs reads --name value and --name=value forms', () => {
  const cli = parseCliArgs(['--limit', '30', '--tiers=P1,P2', '--force']);
  assert.equal(cli.valueFor('limit'), '30');
  assert.equal(cli.valueFor('tiers'), 'P1,P2');
  assert.equal(cli.valueFor('missing'), undefined);
  assert.ok(cli.args.includes('--force'));
});

test('numeric options validate and clamp', () => {
  const cli = parseCliArgs(['--limit', '30', '--bad', 'abc', '--zero', '0']);
  assert.equal(cli.integerOption('limit', 5, 10), 10);
  assert.equal(cli.integerOption('absent', 5, 10), 5);
  assert.throws(() => cli.integerOption('bad', 1, 5), /Invalid --bad/);
  assert.equal(cli.positiveNumber('limit', 1), 30);
  assert.throws(() => cli.positiveNumber('zero', 1), /--zero must be a positive number/);
});
