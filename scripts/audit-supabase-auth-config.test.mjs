import assert from 'node:assert/strict';
import {
  auditSupabaseAuthConfig,
  sanitizeSupabaseAuthConfig,
} from './audit-supabase-auth-config.mjs';

{
  const sanitized = sanitizeSupabaseAuthConfig({
    security_captcha_enabled: true,
    security_captcha_provider: 'cloudflare_turnstile',
    security_captcha_secret: 'never-log-this-secret',
    external_github_enabled: true,
    external_google_enabled: false,
  });

  assert.deepEqual(sanitized, {
    captcha: {
      enabled: true,
      provider: 'turnstile',
      secretConfigured: true,
      siteKeyConfiguredInAuthConfig: false,
      discoveredConfigPaths: [
        'security_captcha_enabled',
        'security_captcha_provider',
        'security_captcha_secret',
      ],
    },
    oauth: {
      githubEnabled: true,
      googleEnabled: false,
    },
  });

  assert.equal(JSON.stringify(sanitized).includes('never-log-this-secret'), false);
}

{
  const report = await auditSupabaseAuthConfig({
    projectRef: 'project-ref',
    accessToken: '',
  });
  assert.equal(report.status, 'blocked');
  assert.equal(report.managementTokenConfigured, false);
}

{
  let authorizationHeader = '';
  const report = await auditSupabaseAuthConfig({
    projectRef: 'project-ref',
    accessToken: 'management-token',
    fetchImpl: async (_url, init) => {
      authorizationHeader = String(init?.headers?.Authorization ?? '');
      return new Response(JSON.stringify({
        security_captcha_enabled: true,
        security_captcha_provider: 'hcaptcha',
        security_captcha_secret: 'masked-by-audit',
        external_github_enabled: true,
        external_google_enabled: false,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.equal(authorizationHeader, 'Bearer management-token');
  assert.equal(report.status, 'passed');
  assert.equal(report.config.captcha.provider, 'hcaptcha');
  assert.equal(report.config.captcha.secretConfigured, true);
  assert.equal(JSON.stringify(report).includes('masked-by-audit'), false);
}

{
  const report = await auditSupabaseAuthConfig({
    projectRef: 'project-ref',
    accessToken: 'invalid-token',
    fetchImpl: async () => new Response('{"message":"unauthorized"}', { status: 401 }),
  });

  assert.equal(report.status, 'failed');
  assert.equal(report.reason, 'Supabase Management API returned HTTP 401.');
  assert.equal(JSON.stringify(report).includes('invalid-token'), false);
}

console.log('Supabase Auth configuration audit: all tests passed.');
