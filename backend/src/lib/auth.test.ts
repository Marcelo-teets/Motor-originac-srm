import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildAuthSessionCookie,
  buildClearAuthSessionCookie,
  extractAuthTokenFromCookieHeader,
  toPublicSession,
  type AuthSession,
} from './auth.js';

describe('auth session cookies', () => {
  const session: AuthSession = {
    access_token: 'supabase-access-token',
    refresh_token: 'supabase-refresh-token',
    expires_at: Date.now() + 60_000,
    user: {
      id: 'user-1',
      email: 'user@example.com',
      role: 'admin',
    },
  };

  it('serializes an HttpOnly SameSite session cookie', () => {
    const cookie = buildAuthSessionCookie(session);

    assert.match(cookie, /^motor_originacao_session=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Path=\//);
    assert.doesNotMatch(cookie, /refresh-token/);
  });

  it('extracts the auth token from a cookie header', () => {
    const cookie = buildAuthSessionCookie(session);

    assert.equal(extractAuthTokenFromCookieHeader(`theme=dark; ${cookie}`), 'supabase-access-token');
  });

  it('returns a public session without browser-readable tokens', () => {
    const publicSession = toPublicSession(session) as Record<string, unknown>;

    assert.equal(publicSession.access_token, undefined);
    assert.equal(publicSession.refresh_token, undefined);
    assert.deepEqual(publicSession.user, session.user);
    assert.equal(publicSession.expires_at, session.expires_at);
  });

  it('serializes a clearing cookie for logout', () => {
    const cookie = buildClearAuthSessionCookie();

    assert.match(cookie, /^motor_originacao_session=/);
    assert.match(cookie, /Max-Age=0/);
    assert.match(cookie, /HttpOnly/);
  });
});
