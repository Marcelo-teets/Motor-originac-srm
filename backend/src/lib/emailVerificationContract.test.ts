import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Neon OTP first-party proxy uses the documented email-verification endpoints', () => {
  const auth = read('./auth.ts');
  assert.match(auth, /export const sendEmailVerificationOtp/);
  assert.match(auth, /neonAuthRequest\('\/email-otp\/send-verification-otp'/);
  assert.match(auth, /type: 'email-verification'/);
  assert.match(auth, /export const confirmEmailVerificationOtp/);
  assert.match(auth, /neonAuthRequest\('\/email-otp\/verify-email'/);
  assert.match(auth, /return \{ verified: true \}/);
  assert.doesNotMatch(auth, /console\.log\((otp|password)/);
});

test('OTP routes run before protected platform middleware and validate email/code', () => {
  const server = read('../server.ts');
  const sendIndex = server.indexOf("app.post('/auth/email/send-code'");
  const verifyIndex = server.indexOf("app.post('/auth/email/verify-code'");
  const guardIndex = server.indexOf('app.use(authMiddleware)');
  assert.ok(sendIndex > 0 && verifyIndex > sendIndex && guardIndex > verifyIndex);
  assert.match(server, /sendEmailVerificationOtp\(email\)/);
  assert.match(server, /confirmEmailVerificationOtp\(email, otp\)/);
  assert.match(server, /res\.json\(ok\('real', \{ verified: true \}\)\)/);
  assert.match(server, /\\d\{6,8\}/); 
});

test('login page offers code request, verification and resend without bypassing auth', () => {
  const page = read('../../../frontend/src/pages/LoginPage.tsx');
  const client = read('../../../frontend/src/lib/neonAuth.ts');
  assert.match(page, /'bootstrap' \| 'verify'/);
  assert.match(page, /sendEmailVerificationCode\(email\.trim\(\)\)/);
  assert.match(page, /verifyEmailCode\(email\.trim\(\), verificationCode\.trim\(\)\)/);
  assert.match(page, /Reenviar código/);
  assert.match(client, /'\/auth\/email\/send-code'/);
  assert.match(client, /'\/auth\/email\/verify-code'/);
});
