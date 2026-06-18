# State-of-art release gates

## Non-on-premise rule

The project must not depend on a local machine as the operational source of truth.

- Canonical code: GitHub `Marcelo-teets/Motor-originac-srm`.
- Canonical runtime: Vercel project `motor-originac-srm`.
- Canonical database/auth: Supabase project `hdghpmssudrqhsbvrdyt`.
- Canonical development and validation environment: GitHub Codespaces.
- Local Codex/Desktop machines are temporary editing and diagnostics surfaces only.

## Canonical endpoints

- Frontend: `https://motor-originac-srm-marcelo-teets-projects.vercel.app`
- Login: `/login`
- API root: `/api`
- Production health: `GET /api/health`
- Data capture health: `GET /api/data-capture/health`

Do not use `motor-originac-srm-backend` for release gates, smoke tests, runtime variables, or runbooks.

## Required Codespace gates

Run from the repository root in GitHub Codespaces:

```bash
npm ci
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

For production-like smoke:

```bash
SMOKE_BASE_URL=https://motor-originac-srm-marcelo-teets-projects.vercel.app \
SMOKE_EMAIL=<real-smoke-user> \
SMOKE_PASSWORD=<real-smoke-password> \
SMOKE_REQUIRE_AUTH=true \
npm run smoke:api
```

## Auth contract

- `POST /api/auth/login` sets the backend session cookie.
- The cookie must be `HttpOnly`, `SameSite=Lax`, and `Secure` on Vercel.
- The login response must return user and expiration only, not `access_token`.
- `GET /api/auth/me` validates the cookie.
- Bearer tokens are migration-only compatibility and should not be used by the frontend.

## Supabase release gate

Before production:

- Enable Supabase Auth leaked password protection.
- Run security advisors and block release on unresolved WARN.
- Run performance advisors and document INFO/WARN findings.
- Keep RLS enabled on all public tables.
- For every new public table, include explicit grants or document the no-grant decision.
- Do not remove unused indexes without at least 30 days of production evidence.

## Vercel release gate

Before production:

- Confirm deployment state is `READY`.
- Smoke `/login`, `/api/health`, `/api/data-capture/health`, and one authenticated dashboard call.
- Check recent runtime logs for undocumented `error` or `fatal` events.
- Confirm rollback target: previous READY deployment.
- Keep Fluid Compute warnings clean; do not configure ignored `memory` settings in `vercel.json`.

## Official references

- Supabase password security: https://supabase.com/docs/guides/auth/password-security
- Supabase database advisors: https://supabase.com/docs/guides/database/database-advisors
- Vercel `vercel.json`: https://vercel.com/docs/project-configuration/vercel-json
- Vercel runtime logs: https://vercel.com/docs/logs/runtime
- Vercel MCP logs tool: https://vercel.com/docs/agent-resources/vercel-mcp/tools
