import crypto from 'node:crypto';

const base = String(process.env.NEON_AUTH_BASE_URL || '').replace(/\/$/, '');
if (!base) throw new Error('NEON_AUTH_BASE_URL missing');

const suffix = crypto.randomBytes(8).toString('hex');
const email = `motor-auth-smoke-${suffix}@example.com`;
const password = `A9!${crypto.randomBytes(18).toString('base64url')}`;
const name = 'Motor Auth Smoke';

const json = async (path, init = {}) => {
  const response = await fetch(base + path, {
    ...init,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      origin: 'https://motor-originac-srm.vercel.app',
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text.slice(0, 200) }; }
  return { response, payload };
};

const cookieInfo = (response) => {
  const raw = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  return raw.map((value) => {
    const [pair] = value.split(';');
    const [name] = pair.split('=');
    return { name, raw: value };
  });
};

const signup = await json('/sign-up/email', {
  method: 'POST',
  body: JSON.stringify({ name, email, password, rememberMe: true }),
});
if (!signup.response.ok) throw new Error(`signup HTTP ${signup.response.status}: ${JSON.stringify(signup.payload)}`);

const signupCookies = cookieInfo(signup.response);
const upstreamCookie = signupCookies.find((item) => item.name.includes('session_token'));
if (!upstreamCookie) throw new Error('signup did not set a session cookie');
const cookiePair = upstreamCookie.raw.split(';')[0];

const tokenResponse = await json('/token', {
  method: 'GET',
  headers: { cookie: cookiePair },
});
if (!tokenResponse.response.ok) throw new Error(`token HTTP ${tokenResponse.response.status}: ${JSON.stringify(tokenResponse.payload)}`);

const sessionResponse = await json('/get-session', {
  method: 'GET',
  headers: { cookie: cookiePair },
});
if (!sessionResponse.response.ok) throw new Error(`session HTTP ${sessionResponse.response.status}: ${JSON.stringify(sessionResponse.payload)}`);

const signout = await json('/sign-out', {
  method: 'POST',
  headers: { cookie: cookiePair },
  body: '{}',
});
if (!signout.response.ok) throw new Error(`signout HTTP ${signout.response.status}: ${JSON.stringify(signout.payload)}`);

const jwt = tokenResponse.payload?.token;
const jwtParts = typeof jwt === 'string' ? jwt.split('.') : [];

console.log(JSON.stringify({
  ok: true,
  userId: signup.payload?.user?.id ?? null,
  email,
  signup: {
    status: signup.response.status,
    payloadKeys: Object.keys(signup.payload || {}),
    tokenLooksOpaque: typeof signup.payload?.token === 'string' && signup.payload.token.split('.').length !== 3,
    cookieNames: signupCookies.map((item) => item.name),
  },
  token: {
    status: tokenResponse.response.status,
    payloadKeys: Object.keys(tokenResponse.payload || {}),
    jwtParts: jwtParts.length,
  },
  session: {
    status: sessionResponse.response.status,
    payloadKeys: Object.keys(sessionResponse.payload || {}),
    sessionKeys: Object.keys(sessionResponse.payload?.session || {}),
    userKeys: Object.keys(sessionResponse.payload?.user || {}),
  },
  signout: {
    status: signout.response.status,
    payload: signout.payload,
  },
}, null, 2));
