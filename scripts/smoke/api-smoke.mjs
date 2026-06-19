const baseUrl = (process.env.SMOKE_BASE_URL ?? 'https://motor-originac-srm.vercel.app').replace(/\/$/, '');
const isLocalBase = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(baseUrl);
const apiPrefix = process.env.SMOKE_API_PREFIX ?? (isLocalBase ? '' : '/api');
const smokeEmail = process.env.SMOKE_EMAIL;
const smokePassword = process.env.SMOKE_PASSWORD;
const smokeCaptchaToken = process.env.SMOKE_CAPTCHA_TOKEN;
const smokeBearerToken = process.env.SMOKE_BEARER_TOKEN;
const requireAuthSmoke = process.env.SMOKE_REQUIRE_AUTH === 'true';

class SmokeError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'SmokeError';
    this.details = details;
  }
}

const endpoint = (path) => `${baseUrl}${apiPrefix}${path}`;

const readJson = async (response, path) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new SmokeError(`${path} returned non-JSON response`, {
      status: response.status,
      bodyPreview: text.replace(/\s+/g, ' ').slice(0, 180),
    });
  }
};

const request = async (path, init = {}) => {
  const response = await fetch(endpoint(path), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const payload = await readJson(response, path);
  if (!response.ok && response.status !== 207) {
    throw new SmokeError(`${path} failed with HTTP ${response.status}`, payload);
  }
  return { response, payload };
};

const requestExpectingError = async (path, init = {}, allowedStatuses = []) => {
  const response = await fetch(endpoint(path), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const payload = await readJson(response, path);
  if (!allowedStatuses.includes(response.status)) {
    throw new SmokeError(`${path} returned unexpected HTTP ${response.status}`, payload);
  }
  return { response, payload };
};

const assertEnvelope = (path, payload) => {
  if (!payload || typeof payload !== 'object' || !payload.status || !payload.generatedAt) {
    throw new SmokeError(`${path} returned an invalid API envelope`, payload);
  }
  if (!payload.requestId) {
    throw new SmokeError(`${path} did not include requestId`, payload);
  }
};

const assertErrorEnvelope = (path, payload) => {
  if (!payload || typeof payload !== 'object' || !payload.statusCode || !payload.code || !payload.requestId || !payload.error) {
    throw new SmokeError(`${path} returned an invalid API error envelope`, payload);
  }
};

const run = async () => {
  for (const path of ['/health', '/data-capture/health']) {
    const { payload } = await request(path);
    assertEnvelope(path, payload);
    console.log(`[smoke] ${apiPrefix}${path} ok (${payload.status}, req ${payload.requestId})`);
  }

  const missingSession = await requestExpectingError('/auth/me', {}, [401]);
  assertErrorEnvelope('/auth/me', missingSession.payload);
  console.log(`[smoke] /auth/me unauthenticated error contract ok (req ${missingSession.payload.requestId})`);

  const invalidLogin = await requestExpectingError('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'codex.invalid@example.com', password: 'invalid-password-for-contract-check' }),
  }, [400, 401, 403]);
  assertErrorEnvelope('/auth/login', invalidLogin.payload);
  console.log(`[smoke] /auth/login error contract ok (${invalidLogin.payload.code}, req ${invalidLogin.payload.requestId})`);

  if (smokeBearerToken) {
    const dashboard = await request('/dashboard/summary', {
      headers: {
        Authorization: `Bearer ${smokeBearerToken}`,
      },
    });
    assertEnvelope('/dashboard/summary', dashboard.payload);
    console.log(`[smoke] authenticated dashboard ok with bearer transition token (req ${dashboard.payload.requestId})`);
    return;
  }

  if (!smokeEmail || !smokePassword) {
    if (requireAuthSmoke) throw new SmokeError('SMOKE_EMAIL and SMOKE_PASSWORD are required for authenticated smoke.');
    console.log('[smoke] authenticated flow skipped; set SMOKE_EMAIL and SMOKE_PASSWORD to enable it.');
    return;
  }

  const login = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: smokeEmail, password: smokePassword, captchaToken: smokeCaptchaToken }),
  });
  assertEnvelope('/auth/login', login.payload);

  const setCookie = login.response.headers.get('set-cookie');
  if (!setCookie) throw new SmokeError('/auth/login did not set a session cookie', login.payload);
  if (login.payload.data && 'access_token' in login.payload.data) {
    throw new SmokeError('/auth/login returned access_token to the browser', login.payload.data);
  }

  const sessionCookie = setCookie.split(';')[0];
  const dashboard = await request('/dashboard/summary', {
    headers: {
      Cookie: sessionCookie,
    },
  });
  assertEnvelope('/dashboard/summary', dashboard.payload);
  console.log(`[smoke] authenticated dashboard ok (req ${dashboard.payload.requestId})`);
};

run().catch((error) => {
  console.error('[smoke] failed:', error instanceof Error ? error.message : error);
  if (error?.details) console.error(JSON.stringify(error.details, null, 2));
  process.exitCode = 1;
});
