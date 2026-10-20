import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { hasVerifiedInstitutionalIdentity, hasVerifiedTokenIdentity } from './institutionalIdentity.js';

test('matching verified, unbanned Neon identity is authorized', () => {
  assert.equal(hasVerifiedInstitutionalIdentity(' Person@Example.COM ', 'person@example.com', true, false), true);
  assert.equal(hasVerifiedTokenIdentity('person@example.com', 'PERSON@example.com', 'person@example.com', true, false), true);
});

test('rejects unverified, blocked, missing and mismatched institutional identities', () => {
  assert.equal(hasVerifiedInstitutionalIdentity('p@example.com', 'p@example.com', false, false), false);
  assert.equal(hasVerifiedInstitutionalIdentity('p@example.com', 'p@example.com', true, true), false);
  assert.equal(hasVerifiedInstitutionalIdentity('p@example.com', 'different@example.com', true, false), false);
  assert.equal(hasVerifiedInstitutionalIdentity(null, 'p@example.com', true, false), false);
  assert.equal(hasVerifiedTokenIdentity(undefined, 'p@example.com', 'p@example.com', true, false), false);
  assert.equal(hasVerifiedTokenIdentity('stale@example.com', 'p@example.com', 'p@example.com', true, false), false);
});

test('both production auth boundaries require current verified provider identity, not only JWT or active profile', () => {
  const serverless = readFileSync(new URL('../../../serverless/neon-auth.ts', import.meta.url), 'utf8');
  const backend = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  const profiles = readFileSync(new URL('./userProfiles.ts', import.meta.url), 'utf8');
  assert.match(serverless, /join neon_auth\."user" a on a\.id = p\.id/);
  assert.match(serverless, /hasVerifiedTokenIdentity\(user\.email/);
  assert.match(serverless, /where p\.id = \$1/);
  assert.match(backend, /getVerifiedActiveUserProfileById\(userId, req\.authUser!\.email\)/);
  assert.match(backend, /getVerifiedActiveUserProfileById\(authUser\.id, authUser\.email\)/);
  assert.match(profiles, /join neon_auth\."user" a on a\.id = p\.id/);
  assert.match(profiles, /a\."emailVerified" = true/);
  assert.match(profiles, /getVerifiedActiveUserProfileById\(userId\)/);
});
