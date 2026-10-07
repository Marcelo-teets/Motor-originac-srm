import assert from 'node:assert/strict';
import test from 'node:test';
import { mapWithConcurrency } from './helpers.js';

test('mapWithConcurrency preserves order and never exceeds the limit', async () => {
  let inFlight = 0;
  let peak = 0;
  const results = await mapWithConcurrency([5, 1, 4, 2, 3], 2, async (value, index) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, value));
    inFlight -= 1;
    return `${index}:${value}`;
  });
  assert.deepEqual(results, ['0:5', '1:1', '2:4', '3:2', '4:3']);
  assert.equal(peak, 2);
});

test('mapWithConcurrency handles empty input and propagates failures', async () => {
  assert.deepEqual(await mapWithConcurrency([], 3, async () => 1), []);
  await assert.rejects(mapWithConcurrency([1, 2], 2, async (value) => {
    if (value === 2) throw new Error('boom');
    return value;
  }), /boom/);
});
