import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import test from 'node:test';
import { getHeader, isCronAuthorized, normalizeBaseUrl, parseRequestUrl, readJsonBody, safeEqual } from './http.js';

const withCronSecret = (secret: string | undefined, run: () => void) => {
  const previous = process.env.CRON_SECRET;
  if (secret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = secret;
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
};

const bodyRequest = (body: string) => Object.assign(Readable.from([Buffer.from(body)]), { headers: {} }) as unknown as IncomingMessage;

test('isCronAuthorized is fail-closed and exact', () => {
  withCronSecret(undefined, () => {
    assert.equal(isCronAuthorized({ headers: { authorization: 'Bearer ' } }), false);
  });
  withCronSecret('s3cret', () => {
    assert.equal(isCronAuthorized({ headers: { authorization: 'Bearer s3cret' } }), true);
    assert.equal(isCronAuthorized({ headers: { authorization: ['Bearer s3cret', 'x'] } }), true);
    assert.equal(isCronAuthorized({ headers: { authorization: 'Bearer s3cres' } }), false);
    assert.equal(isCronAuthorized({ headers: { authorization: 'Bearer s3cret-longer' } }), false);
    assert.equal(isCronAuthorized({ headers: {} }), false);
  });
});

test('safeEqual compares strings of different lengths without throwing', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abcd'), false);
});

test('request helpers normalize headers, URLs and base URLs', () => {
  assert.equal(getHeader({ headers: { host: ['a.example', 'b.example'] } }, 'Host'), 'a.example');
  const url = parseRequestUrl({ headers: { host: 'motor.example' }, url: '/api/x?view=loop' });
  assert.equal(url.origin, 'https://motor.example');
  assert.equal(url.searchParams.get('view'), 'loop');
  assert.equal(parseRequestUrl({ headers: {} }).href, 'https://localhost/');
  assert.equal(normalizeBaseUrl('https://a.example///'), 'https://a.example');
});

test('readJsonBody maps malformed and oversized bodies to client errors', async () => {
  assert.deepEqual(await readJsonBody(bodyRequest('{"a":1}')), { a: 1 });
  assert.deepEqual(await readJsonBody(bodyRequest('')), {});
  await assert.rejects(readJsonBody(bodyRequest('{bad')), (error: any) => error.statusCode === 400);
  await assert.rejects(readJsonBody(bodyRequest('[1,2]')), (error: any) => error.statusCode === 400);
  await assert.rejects(readJsonBody(bodyRequest(JSON.stringify({ blob: 'x'.repeat(200) })), 100), (error: any) => error.statusCode === 413);
});
