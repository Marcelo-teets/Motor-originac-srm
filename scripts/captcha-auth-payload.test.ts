import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCaptchaSecurityPayload,
  buildPasswordGrantPayload,
  buildPasswordRecoveryPayload,
} from '../frontend/src/lib/supabaseAuthPayload.js';

test('CAPTCHA token is nested under gotrue_meta_security', () => {
  assert.deepEqual(buildCaptchaSecurityPayload('  verified-token  '), {
    gotrue_meta_security: {
      captcha_token: 'verified-token',
    },
  });
});

test('password grant payload follows the official GoTrue contract', () => {
  assert.deepEqual(
    buildPasswordGrantPayload('user@example.com', 'password', 'captcha-token'),
    {
      email: 'user@example.com',
      password: 'password',
      gotrue_meta_security: {
        captcha_token: 'captcha-token',
      },
    },
  );
});

test('password recovery payload follows the official GoTrue contract', () => {
  assert.deepEqual(
    buildPasswordRecoveryPayload('user@example.com', 'captcha-token'),
    {
      email: 'user@example.com',
      gotrue_meta_security: {
        captcha_token: 'captcha-token',
      },
    },
  );
});

test('empty CAPTCHA tokens do not create misleading metadata', () => {
  assert.deepEqual(buildCaptchaSecurityPayload('   '), {});
  assert.deepEqual(buildPasswordGrantPayload('user@example.com', 'password'), {
    email: 'user@example.com',
    password: 'password',
  });
  assert.deepEqual(buildPasswordRecoveryPayload('user@example.com'), {
    email: 'user@example.com',
  });
});
