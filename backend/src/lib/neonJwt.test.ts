import assert from 'node:assert/strict';
import test from 'node:test';
import { NeonJwtError, resetNeonJwksCache, verifyNeonAccessToken } from './neonJwt.js';

const AUTH_BASE_URL = 'https://ep-test.neonauth.example.tech/neondb/auth';
const ISSUER = new URL(AUTH_BASE_URL).origin;
const JWKS_URL = `${AUTH_BASE_URL}/.well-known/jwks.json`;
const NOW = Date.UTC(2026, 9, 5, 12, 0, 0);

const b64url = (value: string | Uint8Array) => (typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value)).toString('base64url');

type KeyKind = 'EdDSA' | 'RS256' | 'ES256';

const generate = async (alg: KeyKind, kid: string) => {
  const params = alg === 'EdDSA'
    ? { name: 'Ed25519' }
    : alg === 'RS256'
      ? { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }
      : { name: 'ECDSA', namedCurve: 'P-256' };
  const pair = await crypto.subtle.generateKey(params as never, true, ['sign', 'verify']) as CryptoKeyPair;
  const publicJwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid, alg };
  const sign = async (header: Record<string, unknown>, payload: Record<string, unknown>) => {
    const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
    const signParams = alg === 'ES256' ? { name: 'ECDSA', hash: 'SHA-256' } : params;
    const signature = await crypto.subtle.sign(signParams as never, pair.privateKey, new TextEncoder().encode(signingInput));
    return `${signingInput}.${b64url(new Uint8Array(signature))}`;
  };
  return { alg, kid, publicJwk, sign };
};

const claims = (overrides: Record<string, unknown> = {}) => ({
  sub: 'user-1',
  email: 'analyst@example.com',
  iss: ISSUER,
  aud: ISSUER,
  exp: Math.floor(NOW / 1000) + 600,
  ...overrides,
});

const jwksFetch = (keysByCall: unknown[][]) => {
  let calls = 0;
  const fetchImpl = (async () => {
    const keys = keysByCall[Math.min(calls, keysByCall.length - 1)];
    calls += 1;
    return new Response(JSON.stringify({ keys }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetchImpl, calls: () => calls };
};

const config = (fetchImpl: typeof fetch, now = NOW) => ({ authBaseUrl: AUTH_BASE_URL, jwksUrl: JWKS_URL, fetchImpl, now: () => now });

const rejects = (promise: Promise<unknown>, message: RegExp, statusCode = 401) => assert.rejects(
  promise,
  (error: unknown) => error instanceof NeonJwtError && message.test(error.message) && error.statusCode === statusCode,
);

for (const alg of ['EdDSA', 'RS256', 'ES256'] as const) {
  test(`verifies a valid ${alg} Neon Auth token`, async () => {
    resetNeonJwksCache();
    const key = await generate(alg, `kid-${alg}`);
    const { fetchImpl } = jwksFetch([[key.publicJwk]]);
    const token = await key.sign({ alg, kid: key.kid, typ: 'JWT' }, claims({ role: 'authenticated' }));
    const verified = await verifyNeonAccessToken(token, config(fetchImpl));
    assert.equal(verified.id, 'user-1');
    assert.equal(verified.email, 'analyst@example.com');
    assert.equal(verified.role, 'authenticated');
  });
}

test('rejects tampered payloads, missing/expired expiry, wrong issuer/audience and alg none', async () => {
  resetNeonJwksCache();
  const key = await generate('EdDSA', 'kid-1');
  const { fetchImpl } = jwksFetch([[key.publicJwk]]);
  const header = { alg: 'EdDSA', kid: 'kid-1' };

  const valid = await key.sign(header, claims());
  const [h, , s] = valid.split('.');
  await rejects(verifyNeonAccessToken(`${h}.${b64url(JSON.stringify(claims({ sub: 'attacker' })))}.${s}`, config(fetchImpl)), /signature/);

  await rejects(verifyNeonAccessToken(await key.sign(header, claims({ exp: undefined })), config(fetchImpl)), /expiry is missing/);
  await rejects(verifyNeonAccessToken(await key.sign(header, claims({ exp: Math.floor(NOW / 1000) - 3600 })), config(fetchImpl)), /expired/);
  await rejects(verifyNeonAccessToken(await key.sign(header, claims({ nbf: Math.floor(NOW / 1000) + 3600 })), config(fetchImpl)), /not valid yet/);
  await rejects(verifyNeonAccessToken(await key.sign(header, claims({ iss: 'https://evil.example' })), config(fetchImpl)), /issuer/);
  await rejects(verifyNeonAccessToken(await key.sign(header, claims({ aud: 'https://evil.example' })), config(fetchImpl)), /audience/);
  await rejects(verifyNeonAccessToken(await key.sign(header, claims({ sub: '' })), config(fetchImpl)), /subject/);
  await rejects(verifyNeonAccessToken(`${b64url(JSON.stringify({ alg: 'none' }))}.${b64url(JSON.stringify(claims()))}.x`, config(fetchImpl)), /algorithm/);
  await rejects(verifyNeonAccessToken('not-a-jwt', config(fetchImpl)), /Malformed/);
  await rejects(verifyNeonAccessToken('a.b.c', config(fetchImpl)), /Malformed token header/);
});

test('rejects an algorithm that does not match the selected key type', async () => {
  resetNeonJwksCache();
  const key = await generate('EdDSA', 'kid-1');
  const { fetchImpl } = jwksFetch([[key.publicJwk]]);
  const token = await key.sign({ alg: 'RS256', kid: 'kid-1' }, claims());
  await rejects(verifyNeonAccessToken(token, config(fetchImpl)), /Unknown token signing key/);
});

test('refreshes the JWKS once when a rotated kid appears, then caches it', async () => {
  resetNeonJwksCache();
  const oldKey = await generate('EdDSA', 'old');
  const newKey = await generate('EdDSA', 'new');
  const jwks = jwksFetch([[oldKey.publicJwk], [oldKey.publicJwk, newKey.publicJwk]]);

  await verifyNeonAccessToken(await oldKey.sign({ alg: 'EdDSA', kid: 'old' }, claims()), config(jwks.fetchImpl));
  assert.equal(jwks.calls(), 1);

  const rotated = await newKey.sign({ alg: 'EdDSA', kid: 'new' }, claims({ sub: 'user-2' }));
  assert.equal((await verifyNeonAccessToken(rotated, config(jwks.fetchImpl))).id, 'user-2');
  assert.equal(jwks.calls(), 2);

  await verifyNeonAccessToken(rotated, config(jwks.fetchImpl));
  assert.equal(jwks.calls(), 2);
});

test('does not hammer the JWKS endpoint for unknown kids within the cooldown', async () => {
  resetNeonJwksCache();
  const key = await generate('EdDSA', 'known');
  const stranger = await generate('EdDSA', 'stranger');
  const jwks = jwksFetch([[key.publicJwk]]);
  const forged = await stranger.sign({ alg: 'EdDSA', kid: 'stranger' }, claims());

  await rejects(verifyNeonAccessToken(forged, config(jwks.fetchImpl)), /Unknown token signing key/);
  assert.equal(jwks.calls(), 2); // initial load + one forced refresh
  await rejects(verifyNeonAccessToken(forged, config(jwks.fetchImpl)), /Unknown token signing key/);
  await rejects(verifyNeonAccessToken(forged, config(jwks.fetchImpl, NOW + 30_000)), /Unknown token signing key/);
  assert.equal(jwks.calls(), 2); // no further fetches inside the 60s cooldown
  await rejects(verifyNeonAccessToken(forged, config(jwks.fetchImpl, NOW + 61_000)), /Unknown token signing key/);
  assert.equal(jwks.calls(), 3);
});

test('reports JWKS/configuration outages as 503', async () => {
  resetNeonJwksCache();
  const key = await generate('EdDSA', 'kid-1');
  const token = await key.sign({ alg: 'EdDSA', kid: 'kid-1' }, claims());
  const failing = (async () => new Response('down', { status: 502 })) as typeof fetch;
  await rejects(verifyNeonAccessToken(token, config(failing)), /Unable to load Neon Auth JWKS: 502/, 503);
  await rejects(verifyNeonAccessToken(token, { authBaseUrl: '', jwksUrl: '' }), /not configured/, 503);
});
