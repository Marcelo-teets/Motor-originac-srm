# Production source catalog hotfix

Supabase production uses a uuid-based `source_catalog` schema with `metadata.code` as the stable connector key. Runtime must tolerate missing `source_type` and use `metadata.queryTemplate` when present.
