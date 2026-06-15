# API Contract Smoke Test

Run inside the GitHub Codespace after starting the backend.

## Start backend

```bash
cp .env.example .env
npm install
npm run dev:backend
```

## Login and request id checks

```bash
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' \
  -H 'x-request-id: smoke-login' \
  -d '{"email":"dev@motor.local","password":"dev-password"}')

TOKEN=$(node -e "const payload = JSON.parse(process.argv[1]); console.log(payload.data.access_token)" "$LOGIN_RESPONSE")

echo "$LOGIN_RESPONSE" | node -e "const payload = JSON.parse(require('fs').readFileSync(0, 'utf8')); if (!payload.requestId) process.exit(1); console.log(payload.requestId)"
```

## Unknown route returns JSON

```bash
curl -i -s http://localhost:4000/route-that-does-not-exist \
  -H 'x-request-id: smoke-404' \
  -H "Authorization: Bearer $TOKEN"
```

Expected:

- HTTP `404`
- Response header `x-request-id: smoke-404`
- JSON body with `code: "not_found"`
- JSON body with `requestId: "smoke-404"`

## Malformed JSON returns JSON

```bash
curl -i -s -X POST http://localhost:4000/search-profiles \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'x-request-id: smoke-bad-json' \
  --data-binary '{invalid-json'
```

Expected:

- HTTP `400`
- Response header `x-request-id: smoke-bad-json`
- JSON body with `code` derived from the Express parser error
- No Express HTML error page

## Frontend impact

The frontend client should surface operational errors as `ApiClientError` with:

- `statusCode`
- `code`
- `requestId`
- optional `details`

This lets UI error states point directly to backend logs by request id.
