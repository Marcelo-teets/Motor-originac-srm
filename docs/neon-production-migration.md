# Neon production bootstrap — Motor Originação

**Destination project:** `steep-poetry-38942951`
**Destination branch:** `production`
**Canonical code:** `Marcelo-teets/Motor-originac-srm`
**Source of production data:** Supabase `hdghpmssudrqhsbvrdyt` (retain unchanged until verified cutover).

## Status / safety boundary

The root `neon.ts` file follows the supplied Neon CLI configuration (`auth: true`), but this configuration does **not** migrate existing Supabase Auth identities or PostgreSQL records. Do **not** run a cutover merely because `neon deploy` succeeds. The current frontend and backend still depend on Supabase Auth, service-role REST, Storage and `pg_cron`.

The Neon connector available to the conversation currently rejects even read-only project calls because its outer schema rejects `project_id` while its service requires it. Thus no successful remote Neon connection, schema import or data-copy is claimed. The container used to author this PR has no external DNS; a Neon CLI login or package installation from this environment is not possible. All secret values must remain in GitHub/Vercel/Neon secret stores.

## Cloud workspace setup (run at the Motor repository root after browser OAuth)

```bash
npm i -g neon@latest
neon login
neon skills -y
neon mcp -y
neon link --project-id steep-poetry-38942951 --branch production -y
neon config init
# Review the generated config against the canonical neon.ts already committed.
# DO NOT overwrite the reviewed neon.ts with a different default.
```

**Important:** The user's requested `neon deploy` is **gated** on completed source-data recovery, target-schema/data restore, auth integration and validation. Do not deploy an empty database or redirect Vercel yet.

## Extract source safely

1. Obtain a consistent PostgreSQL dump from the Supabase **client side**, preferably over a read-only connection. The Supabase connector has repeatedly returned `Connection terminated due to connection timeout`; this remains an external blocker.
2. Verify the dump contains the expected schema, tables, functions, extensions, user-defined types, rows, RLS policies and required role privileges. For portability, separate business tables from Supabase-managed `auth`, `storage`, `realtime`, Vault and extensions.
3. Encrypt the dump before moving it anywhere; never commit dumps, login tokens or database URLs to GitHub.
4. Restore business schema and data to a **verified empty** Neon production branch. Resolve incompatible extensions and functions explicitly, without silently omitting them.
5. Compare per-table row counts, FK integrity and sample checksums. Preserve timestamps and ID values. Record a completion manifest.
6. Reimplement/replace Supabase-specific services: authentication/JWT and user IDs, privileged REST / PostgREST calls, object storage URL and contents, `pg_cron`, RLS/session context, and all scheduled ingestion workflows.
7. Smoke-test real API calls, authenticated login/logout, pipeline operations, queue processing, ranking, monitoring and representative data-retrieval paths on preview deployment.
8. Only after validated zero-loss dual run: freeze source writes, export final delta, restore, rerun checks, update Vercel runtime secrets and deploy in a controlled window with an explicit rollback. Keep original Supabase intact.

## Acceptance gate for `neon deploy`

- [ ] CLI OAuth login and `neon link` verified for this exact project/branch.
- [ ] Database source dump present and encrypted, recovery tested.
- [ ] Destination business schema, counts, checksums and required functions validated.
- [ ] Auth identity migration / compatibility plan implemented and end-to-end tested.
- [ ] Storage contents and URL mapping verified.
- [ ] All cron equivalents and ingestion pipelines tested without concurrent double writes.
- [ ] Staging Vercel preview confirms real data, permissions and HTTP 2xx on critical APIs.
- [ ] Rollback to original Supabase defined, with no deletion of source.
