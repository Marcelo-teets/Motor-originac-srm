import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeterministicUuid, buildDocumentFingerprint } from './documentFingerprint.js';

test('fingerprints and UUIDs stay stable for the same business identity', () => {
  const parts = ['company-1', 'source-1', 'https://example.com/a', 'title'];
  assert.equal(buildDocumentFingerprint(parts), buildDocumentFingerprint(parts));
  assert.equal(buildDeterministicUuid(parts), buildDeterministicUuid(parts));
  assert.match(buildDeterministicUuid(parts), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('fingerprint changes when business content changes', () => {
  assert.notEqual(
    buildDocumentFingerprint(['company-1', 'old title']),
    buildDocumentFingerprint(['company-1', 'new title']),
  );
});
