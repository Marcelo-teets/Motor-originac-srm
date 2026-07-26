import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./dataCaptureEngine.ts', import.meta.url), 'utf8');

test('empty successful captures are not classified as runtime failures', () => {
  assert.doesNotMatch(
    source,
    /outputs\.length\s*===\s*0[\s\S]{0,80}['"]failed['"]/,
    'an empty result is valid evidence absence, not a connector failure',
  );
  assert.match(
    source,
    /const runStatus = outputs\.some\(\(item\) => item\.connectorStatus !== ['"]real['"]\)[\s\S]{0,80}['"]partial['"][\s\S]{0,80}['"]completed['"]/,
    'only partial connector outputs should downgrade a successful capture run',
  );
});
