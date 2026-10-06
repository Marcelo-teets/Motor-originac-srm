import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';

const AUTH_BASE = 'https://auth.example.test/neondb/auth';
process.env.NEON_AUTH_BASE_URL = AUTH_BASE;
delete process.env.NEON_AUTH_JWKS_URL;
const { verifyNeonJwt } = await import('./auth.js');

const issuer = new URL(AUTH_BASE).origin;
const newKey = (kid: string) => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return { kid, privateKey, jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'EdDSA' } };
};
type Key = ReturnType<typeof newKey>;

const b64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const signToken = (key: Key, claims: Record<string, unknown>) => {
  const head = `${b64url({ alg: 'EdDSA', kid: key.kid })}.${b64url(claims)}`;
  return `${head}.${sign(null, Buffer.from(head), key.privateKey).toString('base64url')}`;
};
const nowSeconds = () => Math.floor(Date.now() / 1000);
const validClaims = (extra: Record<string, unknown> = {}) => ({ sub: 'user-1', iss: issuer, exp: nowSeconds() + 300, ...extra });

let published: Key[] = [];
let jwksFetches = 0;
globalThis.fetch = (async () => {
  jwksFetches += 1;
  return new Response(JSON.stringify({ keys: published.map((key) => key.jwk) }), { status: 200 });
}) as typeof fetch;

const original = newKey('k1');
published = [original];

test('verifyNeonJwt accepts a token signed by a published key', async () => {
  const user = await verifyNeonJwt(signToken(original, validClaims({ email: 'a@b.test' })));
  assert.equal(user.id, 'user-1');
  assert.equal(user.email, 'a@b.test');
});

test('verifyNeonJwt rejects tokens without exp, expired, or not yet valid', async () => {
  const { exp: _omit, ...withoutExp } = validClaims();
  await assert.rejects(verifyNeonJwt(signToken(original, withoutExp)), /no expiry/);
  await assert.rejects(verifyNeonJwt(signToken(original, validClaims({ exp: nowSeconds() - 10 }))), /expired/);
  await assert.rejects(verifyNeonJwt(signToken(original, validClaims({ nbf: nowSeconds() + 3600 }))), /not yet valid/);
});

test('verifyNeonJwt refetches JWKS once for a rotated key and rejects unknown kids', async () => {
  const rotated = newKey('k2');
  published = [original, rotated];
  const before = jwksFetches;
  assert.equal((await verifyNeonJwt(signToken(rotated, validClaims()))).id, 'user-1');
  assert.equal(jwksFetches, before + 1);

  const stranger = newKey('k3');
  const beforeStranger = jwksFetches;
  await assert.rejects(verifyNeonJwt(signToken(stranger, validClaims())), /Unknown JWT signing key/);
  await assert.rejects(verifyNeonJwt(signToken(newKey('k4'), validClaims())), /Unknown JWT signing key/);
  assert.equal(jwksFetches, beforeStranger, 'forced JWKS refreshes are throttled');
});

test('verifyNeonJwt never falls back to another key for a mismatched kid signature', async () => {
  const forged = { ...newKey('k1') };
  await assert.rejects(verifyNeonJwt(signToken(forged, validClaims())), /Invalid token signature/);
});
