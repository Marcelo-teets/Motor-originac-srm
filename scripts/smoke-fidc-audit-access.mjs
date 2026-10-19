import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

/**
 * Negative-path production smoke for the real FIDC evidence and review API.
 * Never supplies an identity, bearer token or cookie. Never writes a review.
 * An unauthenticated POST with an empty body must be rejected by auth before
 * the app can reach the source/identity/persistence layer.
 */
const PROBES = Object.freeze([
  { name: 'cvm-source-list', method: 'GET', path: '/api/candidate-decision-queue/fidc-assignors' },
  { name: 'fidc-latest-reviews', method: 'GET', path: '/api/candidate-decision-queue/fidc-assignors/reviews' },
  { name: 'fidc-review-history', method: 'GET', path: '/api/candidate-decision-queue/fidc-assignors/reviews/00000000000000' },
  { name: 'fidc-review-write', method: 'POST', path: '/api/candidate-decision-queue/fidc-assignors/reviews' },
]);

export const runFidcAuditAccessSmoke = async ({ baseUrl, fetchImpl = fetch } = {}) => {
  assert.ok(typeof baseUrl === 'string' && /^https?:\/\//.test(baseUrl), 'A production base URL is required.');
  const normalized = baseUrl.replace(/\/+$/, '');
  const checks = [];
  for (const probe of PROBES) {
    const response = await fetchImpl(`${normalized}${probe.path}`, {
      method: probe.method,
      redirect: 'manual',
      signal: AbortSignal.timeout(12_000),
      headers: {
        Accept: 'application/json',
        ...(probe.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(probe.method === 'POST' ? { body: '{}' } : {}),
    });
    // A redirect to /login (or a fallback SPA HTML 200) is not API authorization.
    assert.equal(response.status, 401, `${probe.name}: unauthenticated API must reject with HTTP 401, got ${response.status}`);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/i,
      `${probe.name}: unauthorized API responses must be JSON, not SPA HTML`);
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`${probe.name}: unauthorized response is not JSON`);
    }
    assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload),
      `${probe.name}: unauthorized response must be an object`);
    for (const forbidden of ['items', 'data', 'rows', 'cnpj', 'reviewer_email', 'rationale']) {
      assert.ok(!Object.hasOwn(payload, forbidden),
        `${probe.name}: unauthorized response leaked ${forbidden}`);
    }
    checks.push({ check: probe.name, method: probe.method, status: 401, passed: true });
  }
  return { status: 'passed', baseUrl: normalized, checks };
};

const isMain = Boolean(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href);
if (isMain) {
  runFidcAuditAccessSmoke({ baseUrl: process.env.BASE_URL || 'https://motor-originac-srm.vercel.app' })
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
