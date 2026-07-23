# Agentetome — runtime status

Validated on 23/07/2026.

```text
Supabase project: hdghpmssudrqhsbvrdyt
Source code: src_agentetome_api
Source status: real
Source health: healthy
```

## Edge Functions

```text
agentetome-ingest-export
runtime header: agentetome-ingest-export-v2
active deployment version: 3
custom auth: one-time ingestion token

agentetome-recover-package
runtime header: agentetome-recover-package-v1
active deployment version: 2
custom auth: one-time ingestion token
```

Both functions are deployed from the same shared parser and writer located at:

```text
supabase/functions/_shared/agentetome.ts
```

## Real data state

```text
validated full package: 7bb4b5cd-2497-4498-82cd-40892f1e09ee
bronze rows: 12,999
FIDC silver events: 201
exact Company Master matches: 0
automatic score impact: false
```

## Security smoke

A parsed control package was submitted to the recovery runtime again. The response was:

```text
HTTP 200
status: real
bronzeRowsWritten: 4
finalizer status: already_parsed
rawDownloadLinkPersisted: false
```

This validates private Storage read, hash/size/row validation, bronze idempotency and finalizer idempotency.
