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

test('login and refresh refuse unverified identities but point account holder to OTP recovery', () => {
  const server = read('../server.ts');
  const login = server.slice(server.indexOf("app.post('/auth/login'"), server.indexOf("app.post('/auth/session'"));
  const session = server.slice(server.indexOf("app.post('/auth/session'"), server.indexOf("app.post('/auth/email/send-code'"));
  assert.match(login, /getVerifiedActiveUserProfileById\(authUser\.id, authUser\.email\)/);
  assert.match(login, /signOutAuth\(flow\.sessionToken\)/);
  assert.match(login, /Enviar código para verificar meu e-mail/);
  assert.ok(login.indexOf('getVerifiedActiveUserProfileById') < login.indexOf('setAuthSessionCookie'));
  assert.match(session, /getVerifiedActiveUserProfileById\(authUser\.id, authUser\.email\)/);
  assert.match(session, /clearAuthSessionCookie\(res\)/);
  assert.ok(session.indexOf('getVerifiedActiveUserProfileById') < session.indexOf('setAuthSessionCookie'));
  assert.doesNotMatch(login + session, /"emailVerified"\s*=\s*true|update\s+neon_auth/i);
});

test('administrative recovery documentation never instructs deleting a user to reopen claimed bootstrap', () => {
  const docs = read('../../../docs/project-control/v5/RUNBOOKS_OPERACAO_V5.md');
  const rb03 = docs.slice(docs.indexOf('## RB-03'), docs.indexOf('## RB-04'));
  assert.match(rb03, /verified_active_admins/);
  assert.match(rb03, /Enviar código para verificar meu e-mail/);
  assert.match(rb03, /bootstrap_claims/);
  assert.match(rb03, /NÃO|não/);
  assert.doesNotMatch(rb03, /delete_auth_user|Apagar o usuário de smoke/);
});
