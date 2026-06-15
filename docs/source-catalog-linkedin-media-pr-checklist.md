# PR Checklist — Source Catalog LinkedIn + Media

## Scope

- Add LinkedIn source governance and historical metric tables.
- Add media/news source seeds for origination monitoring.
- Extend scraper signal families for LinkedIn and media signals.
- Upgrade Sources UI to show metrics, cadence and history tables.

## Validation checklist

### SQL

- `company_source_metric_snapshots` exists.
- `company_linkedin_role_snapshots` exists.
- Unique expression index for LinkedIn role snapshots exists.
- `source_catalog` contains:
  - `src_linkedin_company_page`;
  - `src_linkedin_credit_roles`;
  - `src_linkedin_company_posts`;
  - business/fintech media RSS sources.

### Frontend

- `/sources` loads with source summary cards.
- LinkedIn sources show metrics tracked.
- Media sources appear under Mídia/RSS.
- No change to auth, dashboard, companies or company detail routes.

### Backend

- `professionalNetworkCompanyScraper` still returns `B2BSignalPackResult`.
- Source ID for LinkedIn company scraper is now `src_linkedin_company_page`.
- Detector supports `media_article` and LinkedIn-specific signal families.

## Follow-up PRs

1. Build scheduled capture job for LinkedIn aggregate snapshots.
2. Persist LinkedIn metrics into `company_source_metric_snapshots`.
3. Persist role families into `company_linkedin_role_snapshots`.
4. Convert metric deltas into `company_signals`.
5. Show LinkedIn history chart in `Company Detail`.
