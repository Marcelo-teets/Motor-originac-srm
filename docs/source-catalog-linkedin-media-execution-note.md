# Execution Note — LinkedIn + Media Sources

This note records the implementation scope for the source expansion branch.

## Implemented now

- New Supabase migration for historical source metrics.
- New Supabase migration for LinkedIn aggregate role snapshots.
- New source catalog entries for LinkedIn company page, LinkedIn credit/risk roles and LinkedIn company posts.
- New media/RSS source entries for Exame, Brazil Journal, Valor Empresas, NeoFeed, Finsiders, Startups.com.br, InfoMoney and Bloomberg Línea.
- Scraper types now include `media_article`.
- Signal detector now includes LinkedIn credit team, LinkedIn capital markets, media funding event and media growth pressure signal families.
- LinkedIn company scraper now extracts observable metric metadata where available.
- Sources UI now displays family coverage, tracked metrics, signals and history tables.

## Not implemented in this PR

- Scheduled LinkedIn capture job.
- Official LinkedIn API credential handling.
- Persistence writer from scraper metadata to `company_source_metric_snapshots`.
- Company Detail LinkedIn history chart.

These remain intentionally separate to keep the PR mergeable and focused.
