import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { runAuthProductionSmoke } from './smoke-auth-production.mjs';

const sha = '1234567890abcdef1234567890abcdef12345678';
const appShell = '<!doctype html><html><head><script type="module" src="/assets/index-test.js"></script></head><body><div id="root"></div></body></html>';
const bundle = [
  'captcha_token',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/auth/v1/settings',
  'github',
  'google',
  'god_mode',
].join(';');

const buildMetadata = (siteKeyConfigured = true) => ({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  commitSha: sha,
  branch: 'main',
  environment: 'production',
  auth: {
    routes: [
      '/login',
      '/forgot-password',
      '/reset-password',
      '/auth/callback',
      '/profile',
      '/change-password',
      '/users',
    ],
    captcha: {
      enabled: true,
      provider: 'turnstile',
      siteKeyConfigured,
      tokenTransport: 'captcha_token',
    },
    oauthProviderDiscovery: true,
    supportedOAuthProviders: ['github', 'google'],
    godModeIncluded: true,
  },
});

const startServer = async ({ siteKeyConfigured = true } = {}) => {
  const server = createServer((request, response) => {
    const path = request.url?.split('?')[0];

    if (path === '/api/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        status: 'real',
        data: {
          mode: 'real',
          build: { gitSha: sha },
        },
      }));
      return;
    }

    if (path === '/build-meta.json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(buildMetadata(siteKeyConfigured)));
      return;
    }

    if (path === '/assets/index-test.js') {
      response.writeHead(200, { 'content-type': 'application/javascript' });
      response.end(bundle);
      return;
    }

    if (['/login', '/forgot-password', '/reset-password', '/auth/callback'].includes(path ?? '')) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(appShell);
      return;
    }

    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found');
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
};

{
  const { server, baseUrl } = await startServer();
  try {
    const report = await runAuthProductionSmoke({ baseUrl, expectedSha: sha });
    assert.equal(report.status, 'passed');
    assert.equal(report.deployedSha, sha);
    assert.equal(report.checks.length, 9);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

{
  const { server, baseUrl } = await startServer({ siteKeyConfigured: false });
  try {
    await assert.rejects(
      runAuthProductionSmoke({ baseUrl, expectedSha: sha }),
      /VITE_CAPTCHA_SITE_KEY is not configured/,
    );
  } finally {
    server.close();
    await once(server, 'close');
  }
}

console.log('Production Auth smoke runner: all tests passed.');
