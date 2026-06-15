# Review Note — LinkedIn + Media Source Expansion

## Why this matters

The origination engine needs more than company websites and generic RSS. LinkedIn and specialized media provide early signals for:

- growth pressure;
- hiring and team buildout;
- credit/risk/collections maturity;
- funding or DCM/FIDC timing;
- narrative change before a public mandate.

## Key design decision

LinkedIn data is modeled as historical company-level and aggregate role-level intelligence. This PR intentionally avoids storing private personal data and avoids depending on authenticated scraping.

## Data model

- `company_source_metric_snapshots`: generic historical source metrics.
- `company_linkedin_role_snapshots`: aggregate role-family snapshots for LinkedIn.
- `source_catalog.metadata`: declares metrics, signals, cadence, provider, compliance and output/history tables.

## Risk control

The source catalog marks LinkedIn entries as `partial`/`degraded` until a compliant official/API/export/manual verified capture route is wired. Media/RSS entries are marked `real` because they can run through public Google News RSS style queries already used elsewhere in the project.
